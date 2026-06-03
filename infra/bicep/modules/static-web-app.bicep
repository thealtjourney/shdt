// Azure Static Web App for the Vite frontend.
// Deployment of the actual build output is handled by the SWA
// GitHub Actions integration (azure/static-web-apps-deploy@v1) using
// the deployment token output by this module.

@description('Region — note SWA is not in UK South yet; westeurope is the closest GA region.')
param location string

@description('Static Web App name.')
param name string

@description('Backend API URL — used by SWA staticwebapp.config.json proxying for /api/*.')
param backendApiUrl string

@description('Tags to apply.')
param tags object

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard'  // Free is fine to start; Standard adds custom domain & private link
    tier: 'Standard'
  }
  properties: {
    repositoryUrl: ''  // CI handles deploys via deployment token, not GitHub integration
    branch: ''
    buildProperties: {
      appLocation: '/client'
      apiLocation: ''
      outputLocation: 'dist'
    }
    provider: 'Custom'
  }
}

// Surface the API URL as a SWA app setting; the SPA reads it at runtime
// via the env-config.js injection in docker-entrypoint.sh.
resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    API_BASE_URL: backendApiUrl
    APP_ENV: 'prod'
  }
}

output id string = swa.id
output name string = swa.name
output defaultHostname string = swa.properties.defaultHostname
#disable-next-line outputs-should-not-contain-secrets
output deploymentToken string = swa.listSecrets().properties.apiKey
