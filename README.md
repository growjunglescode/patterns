# Patterns

Wildlife intelligence for spotted cats. This repo now follows the **Patterns dossier v2.0** and the Osa Jaguar Project POC UI: forest/gold shell, Camtrap DP entities, quality grades, and researcher naming with admin approval.

The full specification is in [`docs/Patterns_Dossier.pdf`](docs/Patterns_Dossier.pdf).

## Product rules (non-negotiable)

- An **Individual** is one animal; a **Detection** is one photo/video. Many detections attach to one individual.
- Until named, the animal is `JAG-0247`. After admin approval, the researcher’s name is canonical everywhere.
- **Names cannot overlap** (case-insensitive). The AI never auto-creates or auto-merges identities.
- Grades: Casual → Needs ID → Confirmed → Research Grade.

## Run locally

```bash
docker compose down -v
docker compose up --build
```

`-v` is required once to drop the old schema.

- App: http://localhost:3000
- API: http://localhost:8000/docs

Demo accounts (seeded):

| Role | Email | Password |
| --- | --- | --- |
| Researcher | ana@patterns.local | osa-field-2026 |
| Admin (name approvals) | admin@patterns.local | patterns-admin |

## What is implemented (dossier phases 0–2, working loop)

Sidebar matches the POC: Overview, Portfolio, Observations, Individuals, Map, Data (plus detection-history matrix), Analytics, Activity, Stations, Upload, Queues, Users.

Azure Bicep remains under `infra/`. To put the app on **GitHub** and deploy to **Azure**, follow [`docs/DEPLOY.md`](docs/DEPLOY.md). CI workflow: `.github/workflows/deploy-azure.yml`.
