# 🖥️ نشر مَـد على Hetzner Cloud

المستودع جاهز للرفع على **Hetzner VPS** عبر Docker + Nginx + Let's Encrypt.
الطريقة الموصى بها: حاوية واحدة للتطبيق (واجهة + API) وخلفها Nginx.

> استخدم سيرفر **CX / CPX (x86_64)**. سلسلة **CAX (ARM)** غير مدعومة حالياً
> بسبب قيود الحزم الأصلية في `pnpm-workspace.yaml`.

---

## المتطلّبات على السيرفر

- Ubuntu 22.04 / 24.04 (أو Debian 12)
- Docker + Docker Compose v2
- نطاق (Domain) يشير إلى IP السيرفر (A record)

```bash
# تثبيت Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# أعد تسجيل الدخول ثم:
docker compose version
```

---

## الخطوات (مرة واحدة)

### ١) ارفع الكود إلى السيرفر
```bash
# من جهازك، أو استنسخ على السيرفر مباشرة:
git clone <رابط-المستودع> /opt/madd
cd /opt/madd
```

### ٢) اضبط المتغيّرات
```bash
cp .env.example .env
nano .env
```

| المتغيّر | القيمة |
|---|---|
| `DOMAIN` | نطاقك، مثل `madd.example.com` |
| `DATABASE_URL` | رابط Postgres (يفضّل Pooling من Supabase، منفذ 6543) |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `SUPABASE_ANON_KEY` | مفتاح anon (مطلوب **قبل البناء**) |
| `ADMIN_EMAILS` | بريدك ليصبح أول مدير |
| `ALLOWED_ORIGINS` | `https://نطاقك` (بعد تفعيل SSL) |

اختياري: `VITE_GOOGLE_MAPS_API_KEY`، ومفاتيح الذكاء الاصطناعي.

### ٣) جداول قاعدة البيانات (مرة واحدة)
الصق `database-setup.sql` في Supabase → SQL Editor، أو من السيرفر بعد البناء:
```bash
# بعد أول بناء ناجح داخل الحاوية / أو محلياً مع DATABASE_URL:
pnpm --filter @workspace/db run push
```

### ٤) البناء والتشغيل
```bash
chmod +x deploy/deploy.sh deploy/enable-ssl.sh
./deploy/deploy.sh
```

أو يدوياً:
```bash
docker compose up -d --build
```

تحقّق: `http://IP-السيرفر/api/healthz` → `{"status":"ok"}`

### ٥) فتح الجدار الناري
في Hetzner Cloud Firewall أو UFW:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### ٦) تفعيل HTTPS
تأكد أن DNS يشير للنطاق، ثم:
```bash
./deploy/enable-ssl.sh
```
ثم ضع في `.env`:
```
ALLOWED_ORIGINS=https://نطاقك
```
وأعد التشغيل:
```bash
docker compose up -d
```

### ٧) Supabase Auth (مرة واحدة)
في لوحة Supabase → Authentication → URL Configuration:
- **Site URL:** `https://نطاقك`
- **Redirect URLs:** `https://نطاقك/auth`

---

## التحديثات اللاحقة
```bash
cd /opt/madd
git pull
./deploy/deploy.sh
```

تجديد الشهادة (شهرياً عبر cron إن رغبت):
```bash
docker compose --profile certbot run --rm certbot renew
docker compose exec nginx nginx -s reload
```

---

## بديل بدون Docker (systemd)

1. ثبّت Node.js 20 و pnpm 10 على السيرفر.
2. `pnpm install && pnpm run build` مع متغيّرات البناء في البيئة.
3. انسخ `deploy/madd.service` إلى `/etc/systemd/system/madd.service`.
4. ضع المشروع في `/opt/madd` وملف `.env` بجانبه.
5. ضع Nginx أمام المنفذ `8080` (استخدم `deploy/nginx/madd.ssl.conf` كمرجع).
6. `systemctl enable --now madd`

---

## استكشاف الأخطاء
| المشكلة | الحل |
|---|---|
| فشل البناء | تأكد أن `VITE_SUPABASE_URL` و `SUPABASE_ANON_KEY` في `.env` قبل البناء |
| CORS / تسجيل دخول | اضبط `ALLOWED_ORIGINS` و Site URL في Supabase |
| 502 من Nginx | `docker compose logs -f app` — تأكد أن healthcheck ناجح |
| ARM / CAX | استخدم CX/CPX بدل CAX |

السجلّات:
```bash
docker compose logs -f app
docker compose logs -f nginx
```
