// Container Apps Environment — the shared infrastructure for all
// Container Apps. Logs are forwarded to the Log Analytics workspace
// declared in observability.bicep; from there App Insights queries
// over them.

@description('Region.')
param location string

@description('Container Apps Environment name.')
param envName string

@description('Log Analytics customer ID (workspace ID).')
param logAnalyticsCustomerId string

@secure()
@description('Log Analytics primary shared key.')
param logAnalyticsSharedKey string

@description('Tags to apply.')
param tags object

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

output envId string = env.id
output envName string = env.name
output defaultDomain string = env.properties.defaultDomain
