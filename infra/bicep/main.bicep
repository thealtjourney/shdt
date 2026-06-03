// =====================================================================
// SHDT — Azure infrastructure entry point
//
// Subscription-scoped deployment that creates the resource group plus all
// infrastructure inside it. Deploy with:
//
//     az deployment sub create \
//         --location uksouth \
//         --template-file infra/bicep/main.bicep \
//         --parameters infra/bicep/parameters/prod.bicepparam
//
// What's created (one stack, single environment):
//   * Resource Group
//   * Log Analytics Workspace + Application Insights
//   * User-Assigned Managed Identity (used by Container App for KV/Blob/ACR)
//   * Key Vault (RBAC mode)
//   * Container Registry (Basic SKU)
//   * Storage Account + Blob container "shdt-files"
//   * PostgreSQL Flexible Server with PostGIS extension allow-listed
//   * Container Apps Environment + Container App for the backend
//   * Static Web App for the frontend (deployed separately via SWA workflow)
//
// Costs at this configuration (low usage, UK South, GBP, approximate):
//   PostgreSQL (B2s)        ~£40/mo
//   Container Apps          ~£0–£15/mo (consumption, scale-to-zero)
//   Static Web App (Free)   ~£0
//   Storage Account (LRS)   ~£1/mo
//   ACR (Basic)             ~£4/mo
//   Application Insights    free tier covers initial volume
//   ─────────
//   Total                   ~£45–£60/mo at low usage
// =====================================================================

targetScope = 'subscription'

// ─── Parameters ──────────────────────────────────────────────────────

@description('Application short name; used in resource naming (lowercase, no hyphens).')
param appName string = 'shdt'

@description('Environment name (prod / staging / dev). Drives sizing and naming.')
@allowed(['prod', 'staging', 'dev'])
param environmentName string = 'prod'

@description('Azure region. UK South is the default for SHDT.')
param location string = 'uksouth'

@description('Object ID of the principal (user / group / SP) that should be granted Key Vault Secrets Officer at bootstrap so they can seed secrets. Find via: az ad signed-in-user show --query id -o tsv')
param adminPrincipalId string

@description('Postgres admin login (NOT the application user).')
param postgresAdminLogin string = 'shdt_admin'

@secure()
@description('Postgres admin password. Surface this via .bicepparam from a Key Vault reference or pass at deploy time. Do NOT commit literal value.')
param postgresAdminPassword string

@description('Postgres SKU. B2s (2 vCPU, 4 GB) is fine for SHDT at current scale.')
param postgresSkuName string = 'Standard_B2s'

@description('Postgres tier (Burstable / GeneralPurpose / MemoryOptimized).')
param postgresTier string = 'Burstable'

@description('Postgres storage size in GB. 32 GB is the floor for Flexible Server.')
param postgresStorageGB int = 32

@description('Backend container image — set during CD by the GitHub Actions workflow.')
param backendImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container App scale settings.')
param containerAppMinReplicas int = 1
param containerAppMaxReplicas int = 3

// ─── Naming ──────────────────────────────────────────────────────────
//
// Convention: <abbrev>-<app>-<env>-<region>-<token>
// Resources requiring globally unique lowercase-no-hyphen names use a
// uniqueString() suffix for stability.

var locationAbbrev = {
  uksouth: 'uks'
  ukwest: 'ukw'
  westeurope: 'weu'
  northeurope: 'neu'
}[location]

var resourceToken = uniqueString(subscription().subscriptionId, appName, environmentName)
var resourceTokenShort = substring(resourceToken, 0, 8)

var rgName = 'rg-${appName}-${environmentName}-${locationAbbrev}'
var managedIdentityName = 'id-${appName}-${environmentName}-${locationAbbrev}'
var keyVaultName = 'kv-${appName}-${environmentName}-${resourceTokenShort}'
var acrName = toLower('acr${appName}${environmentName}${resourceTokenShort}')
var storageAccountName = toLower('st${appName}${environmentName}${resourceTokenShort}')
var logAnalyticsName = 'log-${appName}-${environmentName}-${locationAbbrev}'
var appInsightsName = 'appi-${appName}-${environmentName}-${locationAbbrev}'
var postgresName = 'psql-${appName}-${environmentName}-${locationAbbrev}-${resourceTokenShort}'
var containerEnvName = 'cae-${appName}-${environmentName}-${locationAbbrev}'
var backendAppName = 'ca-${appName}-${environmentName}-${locationAbbrev}-api'
var staticWebAppName = 'swa-${appName}-${environmentName}-${locationAbbrev}'

var tags = {
  application: appName
  environment: environmentName
  managedBy: 'bicep'
  costCenter: 'shdt'
}

// ─── Resource group ──────────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: tags
}

// ─── Modules ─────────────────────────────────────────────────────────

module observability 'modules/observability.bicep' = {
  scope: rg
  name: 'observability'
  params: {
    location: location
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    tags: tags
  }
}

module identity 'modules/identity.bicep' = {
  scope: rg
  name: 'identity'
  params: {
    location: location
    managedIdentityName: managedIdentityName
    tags: tags
  }
}

module acr 'modules/acr.bicep' = {
  scope: rg
  name: 'acr'
  params: {
    location: location
    acrName: acrName
    tags: tags
    managedIdentityPrincipalId: identity.outputs.principalId
  }
}

module storage 'modules/storage.bicep' = {
  scope: rg
  name: 'storage'
  params: {
    location: location
    storageAccountName: storageAccountName
    tags: tags
    managedIdentityPrincipalId: identity.outputs.principalId
  }
}

module keyvault 'modules/keyvault.bicep' = {
  scope: rg
  name: 'keyvault'
  params: {
    location: location
    keyVaultName: keyVaultName
    tags: tags
    managedIdentityPrincipalId: identity.outputs.principalId
    adminPrincipalId: adminPrincipalId
    postgresAdminPassword: postgresAdminPassword
  }
}

module postgres 'modules/postgres.bicep' = {
  scope: rg
  name: 'postgres'
  params: {
    location: location
    serverName: postgresName
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
    skuName: postgresSkuName
    tier: postgresTier
    storageGB: postgresStorageGB
    tags: tags
  }
}

module containerEnv 'modules/container-app-env.bicep' = {
  scope: rg
  name: 'containerEnv'
  params: {
    location: location
    envName: containerEnvName
    logAnalyticsCustomerId: observability.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: observability.outputs.logAnalyticsSharedKey
    tags: tags
  }
}

module backend 'modules/container-app.bicep' = {
  scope: rg
  name: 'backend'
  params: {
    location: location
    appName: backendAppName
    containerEnvId: containerEnv.outputs.envId
    image: backendImage
    managedIdentityId: identity.outputs.id
    acrLoginServer: acr.outputs.loginServer
    appInsightsConnectionString: observability.outputs.appInsightsConnectionString
    keyVaultUri: keyvault.outputs.vaultUri
    storageAccountName: storage.outputs.accountName
    storageContainerName: storage.outputs.containerName
    postgresHost: postgres.outputs.fqdn
    postgresDb: postgres.outputs.databaseName
    postgresAdminLogin: postgresAdminLogin
    minReplicas: containerAppMinReplicas
    maxReplicas: containerAppMaxReplicas
    tags: tags
  }
  dependsOn: [
    keyvault
    storage
    postgres
  ]
}

// ─── Scheduled enrichment jobs ───────────────────────────────────────
// Each job spawns a fresh container, runs `python -m jobs.cli --source <X>`,
// and exits. Container Apps Jobs scale to zero between runs.
//
// Cadences are conservative defaults; tune via the `schedule` property below.
// Cron is UTC; format: "minute hour day-of-month month day-of-week".

var jobSpecs = [
  {
    name: 'job-shdt-prod-uks-forecast'
    source: 'forecast'
    schedule: '0 */4 * * *'      // every 4 hours
    description: 'Open-Meteo + EA flood forecast'
  }
  {
    name: 'job-shdt-prod-uks-crime'
    source: 'crime'
    schedule: '0 3 * * *'        // daily 03:00 UTC
    description: 'UK Police 3-month crime aggregation'
  }
  {
    name: 'job-shdt-prod-uks-flood'
    source: 'flood'
    schedule: '0 4 * * 0'        // weekly Sunday 04:00 UTC
    description: 'EA flood zones (rivers, sea, surface water)'
  }
  {
    name: 'job-shdt-prod-uks-epc'
    source: 'epc'
    schedule: '0 2 * * *'        // daily 02:00 UTC
    description: 'EPC register updates'
  }
  {
    name: 'job-shdt-prod-uks-postcodes'
    source: 'postcodes'
    schedule: '0 5 * * 0'        // weekly Sunday 05:00 UTC
    description: 'Postcodes.io geographical context'
  }
  {
    name: 'job-shdt-prod-uks-broadband'
    source: 'broadband'
    schedule: '0 6 1 * *'        // 1st of each month 06:00 UTC
    description: 'Ofcom Connected Nations broadband + utilities'
  }
  {
    name: 'job-shdt-prod-uks-uprn'
    source: 'uprn'
    schedule: '0 7 1 * *'        // 1st of each month 07:00 UTC
    description: 'OS Open UPRN coordinates'
  }
]

@batchSize(2)
module enrichmentJobs 'modules/container-app-job.bicep' = [for spec in jobSpecs: {
  scope: rg
  name: spec.name
  params: {
    location: location
    jobName: spec.name
    sourceName: spec.source
    cronExpression: spec.schedule
    command: [
      'python'
      '-m'
      'jobs.cli'
      '--source'
      spec.source
    ]
    containerEnvId: containerEnv.outputs.envId
    image: backendImage
    managedIdentityId: identity.outputs.id
    acrLoginServer: acr.outputs.loginServer
    appInsightsConnectionString: observability.outputs.appInsightsConnectionString
    keyVaultUri: keyvault.outputs.vaultUri
    storageAccountName: storage.outputs.accountName
    storageContainerName: storage.outputs.containerName
    postgresHost: postgres.outputs.fqdn
    postgresDb: postgres.outputs.databaseName
    postgresAdminLogin: postgresAdminLogin
    tags: union(tags, { jobSource: spec.source, schedule: spec.schedule })
  }
  dependsOn: [
    keyvault
    storage
    postgres
    backend
  ]
}]

module staticWebApp 'modules/static-web-app.bicep' = {
  scope: rg
  name: 'staticWebApp'
  params: {
    location: 'westeurope'  // SWA is not yet in UK South — westeurope is the closest GA region
    name: staticWebAppName
    backendApiUrl: 'https://${backend.outputs.fqdn}/api'
    tags: tags
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────
output resourceGroupName string = rg.name
output managedIdentityClientId string = identity.outputs.clientId
output managedIdentityResourceId string = identity.outputs.id
output keyVaultName string = keyvault.outputs.name
output keyVaultUri string = keyvault.outputs.vaultUri
output acrLoginServer string = acr.outputs.loginServer
output postgresFqdn string = postgres.outputs.fqdn
output postgresDatabase string = postgres.outputs.databaseName
output backendFqdn string = backend.outputs.fqdn
output backendUrl string = 'https://${backend.outputs.fqdn}'
output staticWebAppDefaultHostname string = staticWebApp.outputs.defaultHostname
output staticWebAppDeploymentToken string = staticWebApp.outputs.deploymentToken
output appInsightsConnectionString string = observability.outputs.appInsightsConnectionString
