// Key Vault in RBAC mode. Stores app secrets:
//   * postgres-admin-password (seeded by this module)
//   * secret-key, smtp-password, epc-api-key, ... (seeded by ops post-deploy)
//
// Identities granted access:
//   * Backend Managed Identity → Key Vault Secrets User (read-only)
//   * Admin principal          → Key Vault Secrets Officer (read/write at bootstrap)

@description('Region.')
param location string

@description('Key Vault name (must be globally unique).')
param keyVaultName string

@description('Tags to apply.')
param tags object

@description('Backend Managed Identity principal ID — granted Secrets User.')
param managedIdentityPrincipalId string

@description('Operator principal ID — granted Secrets Officer for seeding/rotation.')
param adminPrincipalId string

@secure()
@description('Postgres admin password to seed into the vault.')
param postgresAdminPassword string

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Seed the postgres admin password
resource postgresPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'postgres-admin-password'
  properties: {
    value: postgresAdminPassword
    contentType: 'text/plain'
  }
}

// Built-in role definition IDs
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var keyVaultSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

// Backend MI → read secrets
resource secretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, managedIdentityPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Admin → seed/rotate secrets
resource secretsOfficerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, adminPrincipalId, keyVaultSecretsOfficerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficerRoleId)
    principalId: adminPrincipalId
    // Allow either user or SP — caller knows which
    principalType: 'User'
  }
}

output id string = kv.id
output name string = kv.name
output vaultUri string = kv.properties.vaultUri
