# Deployment — Option A (Vercel + Supabase + worker host + Upstash)

Topology chosen for the RingCX QA platform:

```
Browser ──▶ Vercel (React SPA)
                │  VITE_API_URL
                ▼
        Worker host (Render / Railway / Fly)
        ├─ @qa/api      (Express REST API, public)
        └─ @qa/worker   (BullMQ: ingest → transcribe → score)
                │              │
      Supabase Postgres    Upstash Redis        S3 bucket (recordings)
```

Vercel is serverless and **cannot** run the always-on worker + Redis, so the API and worker live on one small always-on Node host. The web (static) is on Vercel; the database is Supabase; the queue is Upstash Redis.

> **Status:** deploy is on hold until a Supabase project slot is free (free plan = 2 projects). Everything below is ready; fill the env vars when the slot opens. To test earlier without touching the Supabase quota, use **Neon** (free Postgres) in place of Supabase — the steps are identical, just a different `DATABASE_URL`.

---

## 1. Database — Supabase (or Neon for testing)

1. Create a Postgres project. Grab two connection strings:
   - **Pooled** (Supabase: port `6543`) → `DATABASE_URL`, append `?pgbouncer=true&connection_limit=1`
   - **Direct** (Supabase: port `5432`) → `DIRECT_URL`
   - *(Neon: pooled + direct are both provided; or set `DIRECT_URL = DATABASE_URL`.)*
2. From a machine with the repo:
   ```bash
   DATABASE_URL=... DIRECT_URL=... npm run db:generate
   DATABASE_URL=... DIRECT_URL=... npm run db:migrate   # or: db:push for first cut
   DATABASE_URL=... DIRECT_URL=... npm run db:seed      # seeds the IHG scorecard + an admin
   ```
   > In production, seed only the scorecard + a single admin — then create real users via the Users screen. Do **not** ship the demo accounts.

## 2. Object storage — recordings

Supabase Storage (S3-compatible) or AWS S3. Create a private `recordings` bucket and set `S3_*` env vars. `S3_FORCE_PATH_STYLE=true` for Supabase/MinIO-style endpoints.

## 3. Queue — Upstash Redis

Create a free Upstash Redis database → copy the `rediss://` URL into `REDIS_URL`. (TLS URL works with ioredis/BullMQ.)

## 4. API + worker — Render / Railway / Fly

One repo, two long-running services (or one service running both):

- **API**: start `npm run start -w @qa/api` — expose the port publicly; note the URL.
- **Worker**: start `npm run start -w @qa/worker` — no public port.

Set the full env (see `.env.example`): `JWT_SECRET` (long random), `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `S3_*`, and — when available — `RC_*`, `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`.

## 5. Web — Vercel

- Import the repo; set **Root Directory** to `apps/web` (config is in `apps/web/vercel.json`).
- Env var: `VITE_API_URL` = the public API URL from step 4.
- Deploy. The rewrite rule serves the SPA for all client-side routes.

## 6. Go-live checklist

- [ ] `JWT_SECRET` is a fresh long random string (not the `.env.example` default)
- [ ] Demo accounts **not** seeded in prod; real admin created; users added via UI
- [ ] `GET /health` on the API returns `ringcxConfigured / transcriptionConfigured / scoringConfigured` matching what you've set
- [ ] RC recording API access enabled by your RingCentral rep (`ReadAccounts`) — required before ingestion works
- [ ] Point values + pass threshold on the scorecard confirmed against the official scoring sheet
- [ ] CORS: API currently allows all origins — lock to the Vercel domain before real traffic
