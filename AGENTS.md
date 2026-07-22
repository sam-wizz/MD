# AGENTS.md

## Cursor Cloud specific instructions

Madd Supplies (مَـد) is a pnpm-workspace monorepo: an Express API (`artifacts/api-server`, port 5000), a React/Vite frontend (`artifacts/erb-platform`, port 3000, proxies `/api` → 5000), a Drizzle schema (`lib/db`), and codegen libs. `replit.md` and `BUILD.md` are the canonical dev docs — use them for the standard lint/test/build/run commands (all exposed as pnpm scripts). The update script only runs `pnpm install --frozen-lockfile`; everything below is startup/run context that is intentionally NOT automated.

### What runs out of the box
- `pnpm run typecheck` and `pnpm run test` work with no database or external services. The API tests (`artifacts/api-server`, vitest + supertest) stub Supabase and use a dummy `DATABASE_URL`, so they pass on a bare VM after `pnpm install`.

### Running the full app (requires Postgres + Supabase)
The app needs a Postgres database (`DATABASE_URL`) and a Supabase auth endpoint (`SUPABASE_URL` + `SUPABASE_ANON_KEY`). These are NOT installed by the update script. Two ways to provide them:

1. Preferred / most reliable: set `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` (and optionally `ADMIN_EMAILS`) as Cloud Agent **secrets** pointing at a hosted Supabase project. Then just push the schema and run the dev servers.
2. Fully local (no hosted project needed): the VM has no Postgres/Docker preinstalled. Install PostgreSQL (`apt-get install postgresql`) OR run the Supabase CLI stack (`supabase start`, which needs Docker with the nested-VM workarounds: `fuse-overlayfs` storage driver + `iptables-legacy`). `supabase start` provides both a Postgres (port 54322) and an auth gateway (port 54321) plus an anon-key JWT via `supabase status -o env`. Point `DATABASE_URL` at that Postgres and `SUPABASE_URL`/`SUPABASE_ANON_KEY` at that gateway/key.

Once env vars are set:
- `pnpm --filter @workspace/db run push` — applies the Drizzle schema (fails immediately if `DATABASE_URL` is unset; it throws at import).
- `pnpm --filter @workspace/api-server run dev` — the `dev` script re-bundles with esbuild first, so it does NOT hot-reload; restart it after code changes.
- `pnpm --filter @workspace/erb-platform run dev` — Vite injects `SUPABASE_ANON_KEY`/`VITE_SUPABASE_URL` at startup via `define`, so restart the dev server after changing those env vars (they are not read at runtime in the browser).

### Non-obvious gotchas
- A business_owner account is created with `status: "pending"`. The dashboard's "طلب جديد" (New Order) card only renders once the account is **approved**. To place an order in testing, either add the account email to `ADMIN_EMAILS`, approve it from the admin panel, or set `user_profiles.status = 'approved'` directly in the DB. The order-creation API itself only checks `role = 'business_owner'`, not status.
- The frontend runs without Supabase (falls back to `http://localhost`/`anon`), but login silently won't work until `VITE_SUPABASE_URL` + `SUPABASE_ANON_KEY` are set at dev/build time.
- pnpm only: the root `preinstall` hard-blocks npm/yarn.
