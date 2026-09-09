// Patterns - Azure Container Apps + PostgreSQL + Blob Storage
targetScope = 'subscription'

@description('Azure region')
param location string = 'eastus2'

@description('Short name used in resource names')
param prefix string = 'patterns'

@secure()
param postgresPassword string

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${prefix}-rg'
  location: location
}

module platform 'app.bicep' = {
  name: 'patterns-platform'
  scope: rg
  params: {
    location: location
    prefix: prefix
    postgresPassword: postgresPassword
  }
}

output webUrl string = platform.outputs.webUrl
output apiUrl string = platform.outputs.apiUrl
