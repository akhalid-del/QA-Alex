# RingCX QA — Call Center Quality Monitoring

Quality-monitoring platform for **SUB-Logical Technology Solutions'** RingCX call center.
It ingests call interactions + recordings from the **RingCX API**, transcribes them with
**AssemblyAI**, scores each sampled call **Pass/Fail** against a configurable scorecard
using the **Claude API**, and gives QA analysts a review workflow with dashboards.

> Full design & rationale: `~/.claude/plans/glimmering-dreaming-mist.md`

## Architecture

```
RingCX API ─▶ ingest worker ─▶ transcribe (AssemblyAI) ─▶ score (Claude) ─▶ Postgres ─▶ React SPA
             (BullMQ + Redis queues; each stage idempotent, RingCX rate-limited to 2/min)
```

Monorepo (npm workspaces):

| Path | What |
|---|---|
| `packages/shared` | Config, RBAC, domain types, Zod DTOs, verdict logic |
| `packages/db` | Prisma schema, client, seed |
| `apps/api` | Express REST API (JWT auth + RBAC) |
| `apps/web` | React + Vite SPA |
| `packages/pipeline` | BullMQ queues + job types (shared by API & worker) |
| `packages/ringcx` | RingCX API client (JWT auth, metadata, recording download) |
| `packages/transcribe` | AssemblyAI adapter (diarization + PII redaction) |
| `packages/scoring` | Claude scoring engine (script + rubric → Pass/Fail) |
| `apps/worker` | BullMQ workers: ingest → transcribe → score |

## Phase 1 — run it locally (no external accounts needed)

Requires Node ≥ 20 and Docker.

```bash
# 1. Install
npm install

# 2. Start infra (Postgres, Redis, MinIO)
docker compose up -d

# 3. Configure env
cp .env.example .env         # defaults already match docker-compose

# 4. Create schema + generate client + seed demo data
npm run db:generate
npm run db:push
npm run db:seed

# 5. Run API, web, and the pipeline worker (separate terminals)
npm run dev:api
npm run dev:web
npm run dev:worker   # ingest → transcribe → score (needs credentials to do real work)
```

Open http://localhost:5173 and sign in with a demo account (password `password123`):

| Email | Role |
|---|---|
| admin@sublogical.com | Admin |
| manager@sublogical.com | QA Manager |
| analyst@sublogical.com | QA Analyst |
| lead@sublogical.com | Team Lead |
| agent@sublogical.com | Agent |

Each role sees a different scope (all calls / team / own) and different actions.

## Tests

```bash
npm test          # runs unit tests across workspaces (verdict logic, etc.)
```

## The live pipeline (Phases 2–4 — implemented)

The worker runs three BullMQ stages. Each activates when its credentials are present; without them the worker still boots and logs what's missing.

1. **Ingest** (`RC_*` creds + recording API enabled by your RingCentral rep, `ReadAccounts` scope) — polls RingCX every 5 min (with a 15-min lag), upserts interactions idempotently, samples `QA_SAMPLE_PERCENT`, downloads sampled recordings to storage. Metadata is rate-limited to 2/min (BullMQ limiter) and the recording backlog self-heals across polls.
2. **Transcribe** (`ASSEMBLYAI_API_KEY`) — diarized transcript (agent/customer) + PII redaction.
3. **Score** (`ANTHROPIC_API_KEY`) — Claude grades the transcript against the active scorecard's **script + rubric**, returning per-criterion Pass/Fail with verbatim evidence quotes. Verdict math is computed in code, never by the model.

The real QA rubric (fatal + non-fatal IHG/HICV mistakes) and the approved script are encoded in `packages/db/src/ihg-scorecard.ts` and seeded as the active scorecard. Scoring uses **deduction mode** (start at 100, subtract non-fatal deductions, any fatal = 0, pass ≥ 90%). Point values are placeholders pending the official scoring sheet; edit them in the Scorecard Builder.

The API can also trigger work on demand: `POST /pipeline/ingest/poll` and `POST /pipeline/score/:interactionId`.
