# Patterns

**Individual wildlife intelligence.**

Patterns is an operational system for identifying and tracking individual animals from camera-trap imagery—by natural coat pattern, not telemetry collars. It is built for field science programs that need a durable identity layer across detections, projects, and reviewers.

---

## Mission

Turn raw camera-trap media into a trusted catalog of **individuals**: one animal, many sightings, human-confirmed identity, auditable decisions.

The system does not invent animals. Models propose; people decide. Names are unique. Grades are earned. Public exposure is intentional.

---

## Operating model

| Concept | Definition |
| --- | --- |
| **Detection** | One photo or video event |
| **Individual** | One animal identity across detections |
| **Station** | A camera placement in the field |
| **Project** | Organizational and geographic scope of work |
| **Grade** | Evidence quality: Casual → Needs ID → Confirmed → Research Grade |

Identity codes (e.g. `JAG-0247`) stand until a verified researcher proposes a name and policy allows promotion. The recognition stack never auto-merges or auto-names.

---

## System surface

**Field / ops** — upload, queue, dual review, individuals, map, stations, export  
**Command** — admin control room: people, estate, catalog, recognition, audit  
**Public** — optional shared individual and researcher profiles (no exact GPS on public views)

Onboarding provisions affiliation, study geography, and station inventory. The first account on an empty deployment assumes administrative authority.

---

## Architecture

| Layer | Implementation |
| --- | --- |
| Interface | Next.js (TypeScript) |
| Services | FastAPI |
| Persistence | PostgreSQL (production); Compose for local |
| Objects | Azure Blob Storage (production) |
| Runtime | Azure Container Apps · ACR |
| Provisioning | Bicep (`infra/`) · GitHub Actions |

Recognition: computer-vision pipeline with OpenCV baseline; optional embedding / trained coat re-ID engines where provisioned. Production images prioritize deploy reliability over optional heavyweight ML wheels. Training doctrine: [`docs/RECOGNITION.md`](docs/RECOGNITION.md).

Specification reference: [`docs/Patterns_Dossier.pdf`](docs/Patterns_Dossier.pdf).

---

## Local operations

```bash
docker compose up --build
```

| Endpoint | URL |
| --- | --- |
| Application | http://localhost:3000 |
| API | http://localhost:8000/docs |

Configuration: [`.env.example`](.env.example).

No demo credentials ship with the product. Register through the application.

---

## Deployment

Procedure: [`docs/DEPLOY.md`](docs/DEPLOY.md)  
Pipeline: [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml)

Production footprint (East US 2 · resource group `patterns-rg`):

| Service | URL |
| --- | --- |
| Application | https://patterns-web.agreeabledesert-467420f2.eastus2.azurecontainerapps.io |
| API | https://patterns-api.agreeabledesert-467420f2.eastus2.azurecontainerapps.io/docs |

Decommission:

```bash
az group delete -n patterns-rg --yes --no-wait
```

---

## Repository

```
backend/     API, identity, recognition, administration
frontend/    Operational and public interfaces
infra/       Azure platform definition
docs/        Doctrine and deployment
```

---

## Boundary with external sites

Marketing or institutional websites may sit outside this repository. Authentication and the system of record remain in Patterns. External properties should deep-link to application register and sign-in—not duplicate user stores.
