// Reusable Container Apps Job module.
//
// Each enrichment script gets one of these — the Bicep main file calls
// this module per source with a different name, command and schedule.
//
// Container Apps Jobs are billed per vCPU-second of execution; jobs scale
// to zero between runs. A daily 10-minute job at 0.5 vCPU costs ~£0.30/mo.

@description('Region.')
param location string

@description('Job name. Must be unique within the resource group.')
param jobName string

@description('Container Apps Environment resource ID.')
param containerEnvId string

@description('Image to run — same as the backend Container App.')
param image string

@description('Managed identity resource ID — used for ACR pull + Key Vault + Blob.')
param managedIdentityId string

@description('Cron expression. UTC timezone. Examples: "0 */4 * * *" (every 4h), "0 3 * * *" (daily 03:00).')
param cronExpression string

@description('Command to run inside the container. Default invokes the jobs CLI.')
param command array

@description('CPU per replica (vCPU). Burstable jobs typically need 0.5.')
param cpu string = '0.5'

@description('Memory per replica.')
param memory string = '1Gi'

@description('Postgres connection string is shared with the backend; pass it through.')
param postgresHost string
param postgresDb string
param postgresAdminLogin string

@description('Key Vault URI — same as backend.')
param keyVaultUri string

@description('Storage account name — same as backend.')
param storageAccountName string
param storageContainerName string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('ACR login server.')
param acrLoginServer string

@description('Tags to apply.')
param tags object

@description('Maximum execution duration in seconds before Container Apps kills the job (default 1 hour).')
param replicaTimeoutSeconds int = 3600

@description('Number of retries on failure.')
param replicaRetryLimit int = 1

@description('Source name surfaced via JOB_TRIGGERED_BY=schedule for the runner.')
param sourceName string

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: replicaTimeoutSeconds
      replicaRetryLimit: replicaRetryLimit
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        replicaCompletionCount: 1
        parallelism: 1
      }
      registries: [
        {
          server: acrLoginServer
          identity: managedIdentityId
        }
      ]
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
          name: 'enrichment'
          image: image
          command: command
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            { name: 'JOB_TRIGGERED_BY', value: 'schedule' }
            { name: 'JOB_SOURCE', value: sourceName }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEPLOY_ENV', value: 'prod' }
            { name: 'LOG_LEVEL', value: 'INFO' }
            { name: 'SECRETS_BACKEND', value: 'env' }
            { name: 'AZURE_KEY_VAULT_URL', value: keyVaultUri }
            { name: 'STORAGE_BACKEND', value: 'azure_blob' }
            { name: 'AZURE_STORAGE_ACCOUNT', value: storageAccountName }
            { name: 'AZURE_STORAGE_CONTAINER', value: storageContainerName }
            { name: 'HTTP_BACKEND', value: 'httpx' }
            { name: 'PG_HOST', value: postgresHost }
            { name: 'PG_DB', value: postgresDb }
            { name: 'PG_USER', value: postgresAdminLogin }
            { name: 'PG_PASSWORD', secretRef: 'postgres-admin-password' }
            { name: 'DATABASE_URL', value: 'postgresql://${postgresAdminLogin}:$(PG_PASSWORD)@${postgresHost}:5432/${postgresDb}?sslmode=require' }
          ]
        }
      ]
    }
  }
}

output id string = job.id
output name string = job.name
