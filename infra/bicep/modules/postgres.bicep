// Azure Database for PostgreSQL Flexible Server with PostGIS.
// Burstable B2s (2 vCPU, 4GB) is the right starting tier for SHDT —
// scale up via this module when load demands it.

@description('Region.')
param location string

@description('Server name (must be globally unique).')
param serverName string

@description('Postgres admin login (NOT the application user).')
param adminLogin string

@secure()
@description('Postgres admin password.')
param adminPassword string

@description('Tags to apply.')
param tags object

@description('SKU name — e.g. Standard_B2s (Burstable), Standard_D2s_v3 (GeneralPurpose).')
param skuName string = 'Standard_B2s'

@description('SKU tier.')
@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param tier string = 'Burstable'

@description('Storage size in GB. Minimum 32.')
param storageGB int = 32

@description('Postgres major version.')
@allowed(['14', '15', '16'])
param postgresVersion string = '16'

@description('Application database name.')
param databaseName string = 'shdt'

@description('Allow public access from any Azure service. Set to false and add VNet integration for stricter networking.')
param allowAzureServicesAccess bool = true

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: tier
  }
  properties: {
    version: postgresVersion
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: storageGB
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

// Allow other Azure services (Container Apps) to connect
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = if (allowAzureServicesAccess) {
  parent: pg
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Allow PostGIS in shared_preload_libraries / extensions
resource extensionsConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: pg
  name: 'azure.extensions'
  properties: {
    value: 'POSTGIS,POSTGIS_TOPOLOGY,POSTGIS_RASTER,UUID-OSSP,PG_TRGM'
    source: 'user-override'
  }
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pg
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [
    extensionsConfig
  ]
}

output id string = pg.id
output fqdn string = pg.properties.fullyQualifiedDomainName
output serverName string = pg.name
output databaseName string = db.name
output adminLogin string = adminLogin
