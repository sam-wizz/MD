# Threat Model

_Last reviewed: 2026-07-20. Treat the code as ground truth; update this file when the security posture changes._

## Project Overview

مَـد (Madd Supplies) is a B2B supply-chain platform connecting suppliers and business owners in Saudi Arabia. The stack is Node.js 24 / TypeScript / Express 5 for the API server, PostgreSQL + Drizzle ORM for the database, and a React + Vite frontend (`artifacts/erb-platform`). The app is deployed publicly on Replit autoscale (`https://MADD-Supplies.replit.app`). Authentication is Supabase: the frontend obtains a session token, and the API server verifies it on every request.

## Current Security Posture (implemented)

- **Authentication** — every non-health route uses `requireAuth` (`artifacts/api-server/src/middlewares/auth.ts`), which verifies the bearer token against Supabase (`GET {SUPABASE_URL}/auth/v1/user`) and attaches the verified `userId`/`userEmail` to the request. Caller-supplied identity is never trusted; all queries are scoped server-side to `req.userId`.
- **Authorization** — admin routes additionally use `requireAdmin`, which checks the *verified* email against the `ADMIN_EMAILS` env list.
- **CORS** — allowlist of the app's own Replit domains (`app.ts`); disallowed origins receive no CORS headers.
- **Rate limiting** — 300 req/min global + 30 req/min for write methods, per client IP (`trust proxy` set to 1 hop).
- **Input limits** — JSON body capped at 20 MB (needed for base64 invoice uploads; the invoice route additionally rejects payloads over ~14 MB of base64). List endpoints are capped with `LIMIT` clauses.
- **SQL injection** — Drizzle ORM with parameterized queries throughout; no raw string interpolation into SQL.
- **Secrets** — DB connection string, Supabase keys, and OpenAI-gateway keys come from environment variables; none are committed. The committed `.replit` contains only the public Supabase URL and the admin email address.

## Assets

- **User profiles** (`user_profiles`) — name, email, company, role, phone. PII.
- **Orders and supply requests** — business-sensitive commercial data.
- **Invoice analyses** — uploaded invoice contents and AI-extracted line items; commercially sensitive.
- **Supplier price lists** — competitive commercial data.
- **Database** — reachable only from the API server; API compromise ≈ DB compromise.

## Trust Boundaries

- **Internet → Express API** — public; every non-health route requires a valid Supabase token.
- **Express API → PostgreSQL** — parameterized queries via Drizzle.
- **Express API → Supabase Auth** — per-request token verification over HTTPS.
- **Express API → AI gateway** — invoice images and order data are sent to the OpenAI-compatible endpoint configured by `AI_INTEGRATIONS_OPENAI_BASE_URL`.
- **Browser → Supabase** — anon key is intentionally public.

## Remaining Risks / Watch List

1. **Admin gating** — primary source is the `user_profiles.is_admin` DB flag, managed from the admin panel (self-revocation blocked). `ADMIN_EMAILS` remains as a bootstrap list that trusts the email claim returned by Supabase — keep it to one address and ensure "confirm email" is enforced in the Supabase project.
2. **Auth availability coupling** — token verification calls Supabase over HTTP, softened by a 60-second in-memory cache of verified tokens (`auth.ts`). Trade-off: a revoked token stays usable for up to 60s. For further hardening, switch to local JWT signature verification (JWKS).
3. **Large body limit (20 MB)** — required for invoice uploads but applies to all JSON routes; combined with the write limiter (30/min) the flooding risk is bounded, but a dedicated upload route with a scoped limit would be tighter.
4. **AI output handling** — AI responses are parsed best-effort and stored as JSON-in-text; they are rendered client-side. Do not render AI output as HTML (currently rendered as text — keep it that way).
5. **Rate limits are per-instance** — on autoscale, each instance keeps its own counters; effective limits multiply with instance count.
