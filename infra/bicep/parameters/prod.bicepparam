// Prod parameter file for SHDT Azure deployment.
//
// Deploy with:
//     az deployment sub create \
//         --location uksouth \
//         --template-file infra/bicep/main.bicep \
//         --parameters infra/bicep/parameters/prod.bicepparam \
//         --parameters adminPrincipalId=$(az ad signed-in-user show --query id -o tsv) \
//         --parameters postgresAdminPassword=$(openssl rand -base64 32)
//
// Sensitive values (postgresAdminPassword, adminPrincipalId) should be
// passed at deploy time, NOT committed here.

using '../main.bicep'

param appName = 'shdt'
param environmentName = 'prod'
param location = 'uksouth'

// Provided at deploy time — see comment above.
param adminPrincipalId = ''
param postgresAdminPassword = ''

param postgresAdminLogin = 'shdt_admin'
param postgresSkuName = 'Standard_B2s'
param postgresTier = 'Burstable'
param postgresStorageGB = 32

// Initial image — gets updated by the CD workflow on first push.
param backendImage = 'mcr.microsoft.com/k8se/quickstart:latest'

param containerAppMinReplicas = 1
param containerAppMaxReplicas = 3
