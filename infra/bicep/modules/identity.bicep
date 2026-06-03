// User-Assigned Managed Identity used by the backend Container App
// to authenticate to Key Vault, Storage Account and ACR — no secrets
// stored anywhere.

@description('Region.')
param location string

@description('Managed Identity resource name.')
param managedIdentityName string

@description('Tags to apply.')
param tags object

resource mid 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

output id string = mid.id
output principalId string = mid.properties.principalId
output clientId string = mid.properties.clientId
output name string = mid.name
