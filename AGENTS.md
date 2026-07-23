# AGENTS.md

## Cursor Cloud specific instructions

Standard build/test/run commands live in `replit.md` ("Run & Operate") and `BUILD.md`; use those. This section only covers cloud-VM specifics and non-obvious gotchas.

### What this product is
A pnpm workspace for one product, **Madd Supplies** (Arabic-first B2B supply platform). Runtime services:
- `@workspace/api-server` — Express API, port **5000** (`pnpm --filter @workspace/api-server run dev`).
- `@workspace/erb-platform` — React/Vite frontend, port **3000**, proxies `/api` → `localhost:5000` (`pnpm --filter @workspace/erb-platform run dev`).
- Everything under `lib/*` is a compiled library, not a service.

### External dependencies vs. the cloud VM
Normally the app relies on **external Supabase** (Auth + hosted Postgres). In the cloud VM these are usually **not** configured (no secrets), so use local stand-ins:

1. **Postgres (local):** PostgreSQL 16 is installed. Start it and ensure the app DB exists (idempotent):
   ```bash
   sudo pg_ctlcluster 16 main start
   sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='madd'" | grep -q 1 || \
     sudo -u postgres psql -c "CREATE ROLE madd LOGIN PASSWORD 'madd' CREATEDB;"
   sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='madd'" | grep -q 1 || \
     sudo -u postgres psql -c "CREATE DATABASE madd OWNER madd;"
   export DATABASE_URL="postgres://madd:madd@127.0.0.1:5432/madd"
   pnpm --filter @workspace/db run push   # create/sync schema (run after any schema change)
   ```
2. **Auth (local stand-in):** Supabase is used *only* to issue/verify user JWTs — the app's `user_profiles` table has no FK to Supabase. Run the dev-only GoTrue-compatible stand-in (port **54321**):
   ```bash
   node scripts/dev/mock-supabase-auth.mjs
   ```

### Running the app end-to-end (local stand-ins)
Start the three processes in separate shells (they are long-running — use tmux):
```bash
# 1) auth stand-in
node scripts/dev/mock-supabase-auth.mjs

# 2) API server
export DATABASE_URL="postgres://madd:madd@127.0.0.1:5432/madd" \
  SUPABASE_URL="http://localhost:54321" SUPABASE_ANON_KEY="local-anon-key" \
  ADMIN_EMAILS="admin@madd.local"
pnpm --filter @workspace/api-server run dev

# 3) frontend
export VITE_SUPABASE_URL="http://localhost:54321" \
  VITE_SUPABASE_ANON_KEY="local-anon-key" SUPABASE_ANON_KEY="local-anon-key"
pnpm --filter @workspace/erb-platform run dev
```
Then sign up at `http://localhost:3000/auth` → onboarding → dashboard → create an order (`/orders/new`). The stand-in auto-confirms accounts, so signup logs you straight in.

### Gotchas
- `lib/db/src/index.ts` **throws at import time** if `DATABASE_URL` is unset, so the API server will not boot without it (even for routes that never touch the DB).
- The api-server `dev` script does `build` then `node dist/index.mjs` — it is **not** a watcher. Restart it to pick up code or env-var changes.
- Env for the frontend is read at Vite startup (and baked at `build` time via `SUPABASE_ANON_KEY`); restart/rebuild after changing it.
- New accounts default to `status = pending`, but pending business owners **can** still create orders (`/orders/new`); admin approval only gates supplier assignment.
- For a faithful setup, skip the stand-ins and set the real Supabase secrets (`SUPABASE_URL`/`VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`) plus optional `AI_INTEGRATIONS_OPENAI_*` (AI invoice analysis) and `VITE_GOOGLE_MAPS_API_KEY` (order map).
