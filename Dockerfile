# ─── مَـد — صورة إنتاج لـ Hetzner (Node 20 + pnpm) ───────────────────────────
# البناء: docker compose build
# التشغيل: docker compose up -d

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

# ─── تثبيت الاعتماديات ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/erb-platform/package.json ./artifacts/erb-platform/
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY scripts/package.json ./scripts/
RUN pnpm install --frozen-lockfile

# ─── بناء الواجهة والخادم ────────────────────────────────────────────────────
FROM deps AS build
COPY . .

# مفاتيح Supabase تُدمج في الواجهة وقت البناء — مرّرها كـ build-args
ARG VITE_SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    NODE_ENV=production

RUN pnpm run build

# ─── تشغيل الإنتاج (الحزمة مدمجة بـ esbuild — لا حاجة لكل node_modules) ─────
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/artifacts/erb-platform/dist/public
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 madd \
  && useradd --system --uid 1001 --gid madd madd

COPY --from=build --chown=madd:madd /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=madd:madd /app/artifacts/erb-platform/dist/public ./artifacts/erb-platform/dist/public

USER madd
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/healthz || exit 1

CMD ["node", "artifacts/api-server/dist/index.mjs"]
