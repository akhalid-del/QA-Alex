# Deployment

Phased rollout: a **demo** now (no live RC pipeline needed), then **live** once RingCX access + API keys land.

```
Phase 1 — Demo               Phase 2 — Live pipeline (later)
─────────────────            ────────────────────────────────
Browser ──▶ Vercel (web)     Browser ──▶ Vercel (web)
                │                            │
                ▼                            ▼
     Vercel (api, serverless)      Vercel (api, serverless) ──┐
                │                            │                │
                ▼                            ▼                ▼
        Supabase Postgres          Supabase Postgres    Upstash Redis
                                                               │
                                                               ▼
                                                    Railway (worker only:
                                                    ingest → transcribe → score)
```

The API stays serverless in **both** phases — it's just fast DB queries. Only the worker (which must run continuously to poll RingCX and process the queue) ever needs an always-on host, so Railway is deferred until you're wiring the real pipeline. This also means Phase 1 costs **$0**.

---

## Phase 1 — Demo (GitHub + Supabase + Vercel)

### 1. Push to GitHub
```bash
# Create an empty repo on github.com first (no README/gitignore), then:
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

### 2. Supabase — database
1. Create a project at supabase.com (free tier).
2. Project Settings → Database → grab two connection strings:
   - **Connection pooling** (port `6543`) → this is `DATABASE_URL`; append `&pgbouncer=true` if not already present.
   - **Direct connection** (port `5432`) → this is `DIRECT_URL`.
3. From this repo, run migrations + seed against Supabase (the seed loads the real IHG/HICV scorecard + demo interactions — good enough to demo without any live calls):
   ```bash
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:generate
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:migrate
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:seed
   ```
   > Seeds demo accounts (`admin@sublogical.com` etc., password `password123`). Fine for a demo; replace with real users via the Users screen before this goes to the whole company.

### 3. Vercel — API (serverless)
1. Import the GitHub repo as a **new Vercel project**.
2. **Root Directory**: `apps/api`. Framework preset: *Other*.
3. Environment variables (Project Settings → Environment Variables):
   - `DATABASE_URL`, `DIRECT_URL` — from step 2
   - `JWT_SECRET` — a fresh long random string (`openssl rand -hex 32`), **not** the `.env.example` placeholder
   - `S3_*` — see storage note below; can leave as MinIO placeholders for the demo, recordings just won't resolve (fine — seed data has no real audio anyway)
   - Leave `RC_*`, `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`, `REDIS_URL` **unset** — `/health` and `/pipeline` will correctly report "not configured" instead of erroring
4. Deploy. Note the resulting URL (e.g. `https://ringcx-qa-api.vercel.app`).
5. Sanity check: `curl https://<api-url>/health` → `{"ok":true,...}`.

### 4. Vercel — Web
1. Import the **same** GitHub repo as a second Vercel project.
2. **Root Directory**: `apps/web`. Framework preset: *Vite* (auto-detected via `apps/web/vercel.json`).
3. Environment variable: `VITE_API_URL` = the API URL from step 3.
4. Deploy. This is the link you hand out for the demo.

### 5. Lock down CORS
Once you have the web URL, go back to the **API** Vercel project → Environment Variables → set:
```
CORS_ORIGIN=https://<your-web-url>.vercel.app
```
Redeploy the API. (Leaving it unset allows all origins — fine while wiring things up, not for real use.)

---

## Phase 2 — Live pipeline (when RC access + API keys are ready)

1. **Upstash** — create a free Redis database, copy the `rediss://` URL.
2. **Railway** — new project, one service, source = this repo, **Root Directory** `apps/worker`, start command `npm run start -w @qa/worker`. Env vars: `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL` (Upstash), `S3_*` (real bucket now), `RC_*`, `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`.
3. On the **Vercel API** project, add `REDIS_URL` (same Upstash URL) so it can enqueue jobs, plus the same `RC_*`/`ASSEMBLYAI_API_KEY`/`ANTHROPIC_API_KEY`. Redeploy.
4. Recording storage: point `S3_*` at a real bucket (Supabase Storage or AWS S3) — recordings need to persist between the API (writer) and worker (reader).
5. Confirm RC recording API access has been manually enabled by your RingCentral rep (`ReadAccounts` scope) — required before ingestion can pull recordings.

---

## Go-live checklist

- [ ] `JWT_SECRET` is a fresh long random string
- [ ] Demo accounts removed / passwords rotated before company-wide rollout; real users added via the Users screen
- [ ] `CORS_ORIGIN` set to the real web domain
- [ ] `GET /health` reflects exactly the integrations you've configured
- [ ] Official point deductions + pass threshold confirmed against the real scoring sheet (currently placeholders: 3/5/10, 90%)
- [ ] RC recording API access enabled (Phase 2 only)
