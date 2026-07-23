#!/usr/bin/env bash
# نشر/تحديث مَـد على سيرفر Hetzner (Docker Compose)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "خطأ: لا يوجد ملف .env — انسخ .env.example إلى .env وعبّئ القيم."
  exit 1
fi

# تحميل متغيّرات البناء من .env
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${VITE_SUPABASE_URL:?اضبط VITE_SUPABASE_URL في .env}"
: "${SUPABASE_ANON_KEY:?اضبط SUPABASE_ANON_KEY في .env}"
: "${DATABASE_URL:?اضبط DATABASE_URL في .env}"

mkdir -p deploy/certbot/www deploy/certbot/conf

echo "→ بناء وتشغيل الحاويات..."
docker compose up -d --build --remove-orphans

echo "→ انتظار جاهزية التطبيق..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1/api/healthz" >/dev/null 2>&1 \
    || docker compose exec -T app curl -fsS "http://127.0.0.1:8080/api/healthz" >/dev/null 2>&1; then
    echo "✓ التطبيق جاهز"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "تحذير: لم يستجب /api/healthz خلال المهلة — راجع: docker compose logs -f app"
exit 1
