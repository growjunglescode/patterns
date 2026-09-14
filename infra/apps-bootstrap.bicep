// One-time bootstrap for Container Apps. Do not run on every deploy — Bicep PUT
// replaces ingress and drops custom domains / managed certificates.
param location string
param prefix string
@secure()
param postgresPassword string
param postgresFqdn string
param storageConnectionString string
param environmentId string
param identityId string

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: [
            {
              name: 'DATABASE_URL'
              value: 'postgresql+psycopg2://patterns:${postgresPassword}@${postgresFqdn}:5432/patterns?sslmode=require'
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'AZURE_STORAGE_CONTAINER'
              value: 'jaguar-media'
            }
            {
              name: 'SECRET_KEY'
              value: uniqueString(resourceGroup().id, 'jwt')
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-web'
  location: location
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
