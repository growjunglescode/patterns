// Patterns - Azure platform (Postgres, ACR, storage, Container Apps environment)
// Container Apps themselves are bootstrapped once — see apps-bootstrap.bicep
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

output envName string = platform.outputs.envName
output acrName string = platform.outputs.acrName
output storageName string = platform.outputs.storageName
output keyVaultName string = platform.outputs.keyVaultName
