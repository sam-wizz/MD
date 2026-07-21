# 🚂 النشر التلقائي على Railway

المستودع مُهيّأ مسبقاً للنشر على Railway (`railway.json` + `.nvmrc` + سكربت `start`).
كل ما عليك: ربط المستودع مرة واحدة وضبط المتغيّرات. بعدها **كل `git push` يُطلق نشراً جديداً تلقائياً**.

---

## الخطوات (مرة واحدة)

### ١) أنشئ المشروع من المستودع
1. ادخل [railway.app](https://railway.app) وسجّل الدخول بحساب GitHub (`sam-wizz`).
2. **New Project** → **Deploy from GitHub repo** → اختر المستودع **`MD`**.
3. عند طلب الصلاحية، امنح Railway الوصول لمستودع `MD` (خاص).

Railway سيكتشف الإعداد تلقائياً: يبني بـ `pnpm run build` ويشغّل الخادم الذي يقدّم
الواجهة والـ API معاً.

### ٢) اضبط المتغيّرات (تبويب Variables)

⚠️ **مهم:** مفتاح Supabase يجب أن يكون موجوداً **قبل أول بناء**، لأن الواجهة تُدمجه وقت البناء.

| المتغيّر | القيمة |
|---|---|
| `DATABASE_URL` | رابط Postgres من Supabase (استخدم رابط **Connection Pooling**، منفذ 6543) |
| `SUPABASE_URL` | `https://fkacebvbjxkckejkapkg.supabase.co` |
| `SUPABASE_ANON_KEY` | مفتاح anon العام (Supabase → Settings → API) |
| `VITE_SUPABASE_URL` | نفس قيمة `SUPABASE_URL` (تُستخدم وقت بناء الواجهة) |
| `ADMIN_EMAILS` | بريدك — ليصبح أول مدير |
| `ALLOWED_ORIGINS` | رابط موقعك على Railway (تحصل عليه بعد أول نشر، ثم أضِفه هنا) |

اختياري (ميزات الذكاء الاصطناعي): `AI_INTEGRATIONS_OPENAI_API_KEY`،
`AI_INTEGRATIONS_OPENAI_BASE_URL`، `AI_MODEL`.

> **لا تضبط `PORT`** — Railway يحدّده تلقائياً والخادم يقرأه.

### ٣) جداول قاعدة البيانات (مرة واحدة)
إن لم تكن أنشأتها بعد: الصق `database-setup.sql` في Supabase → SQL Editor → Run.

### ٤) الدومين
تبويب **Settings → Networking → Generate Domain** لتحصل على رابط `https://...up.railway.app`.
أضِف هذا الرابط إلى متغيّر `ALLOWED_ORIGINS` ثم أعِد النشر.

---

## بعد الإعداد
- كل `git push` إلى فرع `main` → بناء ونشر تلقائي.
- تحقّق من الصحة: `https://موقعك.up.railway.app/api/healthz` يجب أن يرجع `{"status":"ok"}`.
- السجلّات: تبويب **Deployments** في Railway.

## إن فشل البناء
- تأكّد أن `VITE_SUPABASE_URL` و `SUPABASE_ANON_KEY` مضبوطان **قبل** البناء.
- راجع سجلّ البناء في Railway؛ الإعداد يستخدم pnpm 10 و Node 20 تلقائياً.
