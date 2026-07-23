# مَـد — Madd Supplies (MADD)

B2B supply-chain platform for Saudi Arabia: verified suppliers (موردين) connect with restaurants, cafés, and supermarkets; owners place supply orders, admins approve and assign them to suppliers, and an AI assistant analyzes uploaded invoices against platform prices and recommends suppliers for orders.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build + run the API server (defaults to port 5000 locally; set `PORT` in production)
- `pnpm --filter @workspace/erb-platform run dev` — run the frontend dev server (defaults to port 3000, proxies `/api` to `localhost:5000`; override the target with `API_PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test` — run test suites (API server: vitest + supertest, no DB needed)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env (API): `DATABASE_URL`; for auth: `SUPABASE_URL`/`VITE_SUPABASE_URL` + `SUPABASE_ANON_KEY`/`VITE_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`; for AI routes: `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` (server boots without these; AI endpoints fail until set); optional `AI_MODEL` overrides the gateway model id
- Frontend build env: `SUPABASE_ANON_KEY` (injected at build), optional `VITE_GOOGLE_MAPS_API_KEY` for the order map

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (Supabase JWT auth, CORS allowlist, rate limiting)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind 4 + shadcn/ui, Arabic-first RTL, wouter routing, TanStack Query
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- AI: OpenAI-compatible gateway (invoice OCR + supplier recommendation)

## Deploy (any host)

The API server serves the built frontend automatically when `artifacts/erb-platform/dist/public` exists (override the location with `STATIC_DIR`), so the whole site can run as **one Node service**:

1. `pnpm install && pnpm run build` (frontend needs `SUPABASE_ANON_KEY`, and `VITE_SUPABASE_URL` in the environment at build time; optional `VITE_GOOGLE_MAPS_API_KEY`)
2. Set runtime env: `DATABASE_URL`, `PORT`, `HOST` (defaults to `0.0.0.0`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS` (bootstrap admin), `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, optional `AI_MODEL`, and `ALLOWED_ORIGINS` if the frontend is served from a different domain
3. `pnpm --filter @workspace/db run push` — applies schema (includes the `is_admin` column) to the target Postgres
4. Start: `pnpm --filter @workspace/api-server run start` (build step already produced `dist/index.mjs`)

**Hetzner Cloud:** use `Dockerfile` + `docker-compose.yml` (Nginx reverse proxy + optional Let's Encrypt). See `HETZNER.md`. Prefer CX/CPX (x86_64); CAX ARM is not supported with current native binary overrides.

**Google OAuth (must be configured in the Supabase dashboard, once):**
- Auth → Providers → Google: enable, paste the Client ID/Secret from Google Cloud Console (OAuth consent screen + Web credentials; authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`)
- Auth → URL Configuration: set Site URL to the production domain and add redirect URLs: `https://<your-domain>/auth` and `http://localhost:3000/auth` for local dev

**Admin bootstrap:** the email(s) in `ADMIN_EMAILS` are admins immediately; after signing in, grant/revoke admin for anyone from the admin panel (Accounts tab) — stored in `user_profiles.is_admin`.

## Where things live

- `artifacts/api-server` — Express API (`src/routes/*` per feature, `src/middlewares/auth.ts` for requireAuth/requireAdmin)
- `artifacts/erb-platform` — the web app (`src/pages/*` per route, `src/components/dashboard/*` feature cards)
- `lib/db/src/schema` — **source of truth for the DB schema**
- `lib/api-spec/openapi.yaml` — **source of truth for the API contract** (Orval generates `lib/api-zod` + `lib/api-client-react`)
- `threat_model.md` — security posture and watch list

## Architecture decisions

- Identity always comes from the verified Supabase token server-side; request bodies never carry `user_id`. Verified tokens are cached in-memory for 60s to avoid a Supabase round-trip per request.
- The frontend calls same-origin `/api/*`; in production the API serves the SPA, and the Vite dev proxy covers local dev.
- The OpenAI client is lazy-initialized so the API can boot without the AI integration provisioned.
- `orders` is the primary workflow (pending → approved → assigned → preparing → in_transit → delivered, with optimistic-concurrency status updates). The older `supply_requests` API was removed (superseded by orders); its DB table remains untouched, drop it when convenient.
- Theme: class-based dark mode via next-themes (toggle in the nav, defaults to the OS preference). Signed-in pages are code-split with `React.lazy`.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml`; generated `index.ts` export lines must keep Orval's single-quote style or codegen appends duplicates.
- On Windows, run pnpm through Git Bash (the root `preinstall` uses `sh`); stale committed `*.tsbuildinfo` files can make `tsc --build` skip emitting lib `dist/` — delete them if typecheck reports TS6305.
- `pnpm-workspace.yaml` excludes most platform-specific native binaries; win32-x64 and linux-x64 are the supported dev/prod platforms.
- Admin access = `user_profiles.is_admin` in the DB, plus any verified email in `ADMIN_EMAILS` (bootstrap). Run `db push` before relying on the DB flag.

## Product

- Landing page (`/`), auth with email/password + Google OAuth (`/auth`), profile onboarding (`/onboarding`), role-aware dashboard (`/dashboard`), order creation (`/orders/new`) and tracking (`/orders/:id`), admin panel (`/admin`).
- Roles: `supplier` and `business_owner`; accounts start `pending` until an admin approves them.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
