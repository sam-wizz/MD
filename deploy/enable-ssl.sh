#!/usr/bin/env bash
# إصدار شهادة Let's Encrypt ثم تفعيل إعداد HTTPS
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "خطأ: لا يوجد .env"
  exit 1
fi

# shellcheck disable=SC1091
source .env

DOMAIN="${DOMAIN:?اضبط DOMAIN في .env}"
EMAIL="${CERTBOT_EMAIL:-${ADMIN_EMAILS%%,*}}"

if [[ -z "$EMAIL" ]]; then
  echo "خطأ: ضع CERTBOT_EMAIL أو ADMIN_EMAILS في .env للتواصل مع Let's Encrypt"
  exit 1
fi

mkdir -p deploy/certbot/www deploy/certbot/conf

echo "→ طلب شهادة لـ $DOMAIN ..."
docker compose --profile certbot run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "→ تفعيل إعداد HTTPS..."
sed "s/YOUR_DOMAIN/${DOMAIN}/g" deploy/nginx/madd.ssl.conf > deploy/nginx/madd.conf
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload

echo "✓ HTTPS مفعّل على https://${DOMAIN}"
echo "  تذكّر ضبط ALLOWED_ORIGINS=https://${DOMAIN} وإعادة: docker compose up -d"
