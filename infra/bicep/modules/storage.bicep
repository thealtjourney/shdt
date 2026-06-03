// Storage Account + Blob container "shdt-files" for operational data
// (Excel uploads, OS UPRN cache, IoD downloads). The backend Managed
// Identity is granted Storage Blob Data Contributor on the account.

@description('Region.')
param location string

@description('Storage account name (globally unique, lowercase, no hyphens, 3-24 chars).')
param storageAccountName string

@description('Tags to apply.')
param tags object

@description('Backend Managed Identity principal ID — granted Storage Blob Data Contributor.')
param managedIdentityPrincipalId string

@description('Blob container name for application files.')
param containerName string = 'shdt-files'

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'  // LRS for prod-on-a-budget; flip to ZRS for HA
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false  // Force Managed Identity / AAD auth
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: sa
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

// Storage Blob Data Contributor (read/write blobs, no delete-storage-account)
var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource blobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: sa
  name: guid(sa.id, managedIdentityPrincipalId, blobContributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output id string = sa.id
output accountName string = sa.name
output containerName string = container.name
output blobEndpoint string = sa.properties.primaryEndpoints.blob
