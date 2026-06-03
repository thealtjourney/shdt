// Backend Container App.
// Pulls its image from ACR via the User-Assigned Managed Identity.
// Reads secrets from Key Vault references (also via MI).
// Exposes port 8000 over HTTPS via the Container Apps ingress.

@description('Region.')
param location string

@description('Container App name.')
param appName string

@description('Container Apps Environment resource ID.')
param containerEnvId string

@description('Initial image. Will be updated on each deploy by the GitHub Actions CD workflow.')
param image string

@description('Managed identity resource ID (used for ACR pull + Key Vault read + Blob access).')
param managedIdentityId string

@description('ACR login server FQDN.')
param acrLoginServer string

@description('Application Insights connection string — surfaced as APPLICATIONINSIGHTS_CONNECTION_STRING.')
param appInsightsConnectionString string

@description('Key Vault URI — surfaced as AZURE_KEY_VAULT_URL.')
param keyVaultUri string

@description('Storage account name — used by AzureBlobStorage.')
param storageAccountName string

@description('Storage container name.')
param storageContainerName string

@description('Postgres FQDN.')
param postgresHost string

@description('Postgres database name.')
param postgresDb string

@description('Postgres admin login (used by the app for now; switch to a dedicated app user once a migration sets that up).')
param postgresAdminLogin string

@description('Min replicas (1 = no scale-to-zero, more responsive).')
param minReplicas int = 1

@description('Max replicas at peak.')
param maxReplicas int = 3

@description('Tags to apply.')
param tags object

@description('CPU per replica in vCPU.')
param cpu string = '0.5'

@description('Memory per replica.')
param memory string = '1Gi'

@description('Initial ingress target port.')
param targetPort int = 8000

resource ca 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'http'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: acrLoginServer
          identity: managedIdentityId
        }
      ]
      // Connection string for postgres is passed in as a Key Vault
      // reference at runtime — see secrets[] below.
      secrets: [
        {
          name: 'postgres-admin-password'
          keyVaultUrl: '${keyVaultUri}secrets/postgres-admin-password'
          identity: managedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            // ── Observability
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEPLOY_ENV', value: 'prod' }
            { name: 'LOG_LEVEL', value: 'INFO' }

            // ── Config providers
            { name: 'SECRETS_BACKEND', value: 'env' }   // Container Apps' Key Vault refs deliver them as env vars
            { name: 'AZURE_KEY_VAULT_URL', value: keyVaultUri }
            { name: 'STORAGE_BACKEND', value: 'azure_blob' }
            { name: 'AZURE_STORAGE_ACCOUNT', value: storageAccountName }
            { name: 'AZURE_STORAGE_CONTAINER', value: storageContainerName }
            { name: 'HTTP_BACKEND', value: 'httpx' }

            // ── DB connection
            // Username and host are non-secret; password comes from KV ref above.
            { name: 'PG_HOST', value: postgresHost }
            { name: 'PG_DB', value: postgresDb }
            { name: 'PG_USER', value: postgresAdminLogin }
            { name: 'PG_PASSWORD', secretRef: 'postgres-admin-password' }
            { name: 'DATABASE_URL', value: 'postgresql://${postgresAdminLogin}:$(PG_PASSWORD)@${postgresHost}:5432/${postgresDb}?sslmode=require' }

            // ── Pool sizing — relaxed for managed Postgres
            { name: 'DB_POOL_SIZE', value: '10' }
            { name: 'DB_POOL_MAX_OVERFLOW', value: '20' }
            { name: 'DB_POOL_RECYCLE_S', value: '1800' }

            // ── CORS (set this to the SWA hostname after first deploy)
            { name: 'CORS_ALLOW_ORIGINS', value: 'https://*.azurestaticapps.net' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: targetPort
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: targetPort
              }
              periodSeconds: 15
              failureThreshold: 3
              initialDelaySeconds: 10
            }
            {
              type: 'Startup'
              httpGet: {
                path: '/healthz'
                port: targetPort
              }
              periodSeconds: 5
              failureThreshold: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-rps'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = ca.id
output name string = ca.name
output fqdn string = ca.properties.configuration.ingress.fqdn
