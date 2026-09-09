# Deploy Patterns (GitHub → Azure)

Your app already has Dockerfiles + Azure Bicep (`infra/`). This guide gets the code on GitHub, then deploys API + web to Azure Container Apps.

## What you need

1. A GitHub account (Cursor already connected yours)
2. An Azure subscription (free trial works)
3. On this PC (one-time):
   - [Git](https://git-scm.com/download/win)
   - [GitHub CLI](https://cli.github.com/) — `winget install GitHub.cli`
   - [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli-windows) — `winget install Microsoft.AzureCLI`
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local image builds, or use GitHub Actions)

---

## Part A — Put the project on GitHub

Open **PowerShell** in `C:\Users\Miguel Guevara\Projects\Patterns` and run:

```powershell
# 1) Make this folder a git repo
git init -b main
git add .
git commit -m "Initial commit: Patterns wildlife intelligence app"

# 2) Sign in to GitHub (browser window)
gh auth login

# 3) Create a private GitHub repo and push
gh repo create Patterns --private --source=. --remote=origin --push
```

If `gh` says the name is taken, use another name, e.g. `Patterns-wildlife`.

Confirm: open https://github.com and you should see the repo.

---

## Part B — One-time Azure login + deploy identity

```powershell
az login
az account list -o table
# If you have more than one subscription:
az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"
```

Create an app registration that GitHub Actions can use (OIDC — no long-lived password):

```powershell
$SUB = az account show --query id -o tsv
$TENANT = az account show --query tenantId -o tsv

# Replace OWNER/REPO with your GitHub path, e.g. miguelguevara/Patterns
gh secret set AZURE_SUBSCRIPTION_ID --body $SUB
gh secret set AZURE_TENANT_ID --body $TENANT

# Create Entra app + federated credential for GitHub Actions
az ad app create --display-name "patterns-github-deploy" --query appId -o tsv
# Save that appId as $CLIENT_ID, then:
# $CLIENT_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

az ad sp create --id $CLIENT_ID
az role assignment create --assignee $CLIENT_ID --role Contributor --scope "/subscriptions/$SUB"

# Federated credential (GitHub OIDC) — replace OWNER and REPO
az ad app federated-credential create --id $CLIENT_ID --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:OWNER/REPO:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

gh secret set AZURE_CLIENT_ID --body $CLIENT_ID

# Strong Postgres password for Azure (store only as a secret)
$PG = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
gh secret set POSTGRES_PASSWORD --body $PG
Write-Host "Postgres password saved to GitHub secret POSTGRES_PASSWORD (copy somewhere safe if you need it later)"
```

Simpler alternative if the federated-credential JSON is awkward: use **Azure Portal → Microsoft Entra ID → App registrations → New → Certificates & secrets is NOT needed**; instead add **Federated credentials → GitHub Actions deploying Azure resources**, pick your repo + branch `main`, then set the three `AZURE_*` secrets + `POSTGRES_PASSWORD` in the GitHub repo **Settings → Secrets and variables → Actions**.

---

## Part C — Deploy

### Option 1 — GitHub Actions (recommended)

1. Push to `main` (or open the Actions tab → **Deploy to Azure** → **Run workflow**).
2. Wait for the green check.
3. Open the workflow summary for the **Web** and **API** URLs.

Workflow file: `.github/workflows/deploy-azure.yml`

It will:

1. Deploy `infra/main.bicep` (Postgres, Blob, ACR, Container Apps)
2. Build + push API/web Docker images
3. Point Container Apps at those images

### Option 2 — Deploy from your PC

```powershell
$PG = "PickAStrongPassword123!"
az deployment sub create `
  --name patterns-platform `
  --location eastus2 `
  --template-file infra/main.bicep `
  --parameters prefix=patterns location=eastus2 postgresPassword=$PG

$RG = "patterns-rg"
$ACR = az acr list -g $RG --query "[0].name" -o tsv
$API = az containerapp show -g $RG -n patterns-api --query "properties.configuration.ingress.fqdn" -o tsv
$WEB = az containerapp show -g $RG -n patterns-web --query "properties.configuration.ingress.fqdn" -o tsv

az acr login -n $ACR
docker build -t "$ACR.azurecr.io/patterns-api:latest" ./backend
docker build --build-arg "NEXT_PUBLIC_API_URL=https://$API" -t "$ACR.azurecr.io/patterns-web:latest" ./frontend
docker push "$ACR.azurecr.io/patterns-api:latest"
docker push "$ACR.azurecr.io/patterns-web:latest"

$ACR_USER = az acr credential show -n $ACR --query username -o tsv
$ACR_PASS = az acr credential show -n $ACR --query "passwords[0].value" -o tsv
az containerapp registry set -g $RG -n patterns-api --server "$ACR.azurecr.io" --username $ACR_USER --password $ACR_PASS
az containerapp registry set -g $RG -n patterns-web --server "$ACR.azurecr.io" --username $ACR_USER --password $ACR_PASS

az containerapp update -g $RG -n patterns-api --image "$ACR.azurecr.io/patterns-api:latest" --set-env-vars "CORS_ORIGINS=https://$WEB"
az containerapp update -g $RG -n patterns-web --image "$ACR.azurecr.io/patterns-web:latest"

Write-Host "Web: https://$WEB"
Write-Host "API: https://$API"
```

---

## After deploy

1. Open the **Web** URL and register (first user becomes admin).
2. Complete onboarding.
3. Cost note: Flexible Postgres + Container Apps + ACR will bill while running. Tear down when done testing:

```powershell
az group delete -n patterns-rg --yes --no-wait
```

---

## Stuck?

| Problem | Fix |
| --- | --- |
| `gh` / `az` not found | Close + reopen PowerShell after winget install, or restart PC |
| GitHub Actions Azure login fails | Check `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and federated credential subject matches `repo:OWNER/REPO:ref:refs/heads/main` |
| Frontend calls wrong API | Rebuild web image with `NEXT_PUBLIC_API_URL` set to the live API URL |
| DB connection errors | Confirm Postgres firewall rule `AllowAzure` exists (Bicep creates it) |
