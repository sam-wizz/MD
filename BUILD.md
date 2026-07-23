# 🛠️ بناء موقع مَـد من الكود المصدري

هذه حزمة **الكود المصدري الكامل** — للتعديل والتطوير ثم البناء بنفسك.
إن كنت تريد فقط رفع الموقع دون تعديل، استخدم الحزمة الجاهزة (`madd-website.zip`) بدلاً من هذه.

---

## المتطلّبات
- **Node.js 20+**
- **pnpm 10** (مدير الحزم — المشروع لا يعمل مع npm/yarn):
  ```bash
  npm install -g pnpm@10
  ```

---

## بنية المشروع (pnpm workspace)

| المسار | الوصف |
|---|---|
| `artifacts/api-server` | خادم الـ API (Express + Drizzle) |
| `artifacts/erb-platform` | الواجهة الأمامية (React + Vite + Tailwind) |
| `lib/db` | مخطط قاعدة البيانات (Drizzle) |
| `lib/api-spec` | مواصفة OpenAPI ومولّد الكود (Orval) |
| `lib/api-zod`, `lib/api-client-react` | الكود المولّد من المواصفة |
| `lib/integrations-openai-ai-server` | تكامل الذكاء الاصطناعي |

---

## خطوات البناء والتشغيل

### ١) تثبيت المكتبات
```bash
pnpm install
```

### ٢) إنشاء جداول قاعدة البيانات (مرة واحدة)
اضبط `DATABASE_URL` ثم:
```bash
pnpm --filter @workspace/db run push
```
> أو الصق `database-setup.sql` (من الحزمة الجاهزة) في Supabase SQL Editor.

### ٣) ضبط المتغيّرات
الواجهة تحتاج مفتاح Supabase **وقت البناء**:
```bash
export VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```
والخادم يحتاج وقت التشغيل: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`ADMIN_EMAILS`, `ALLOWED_ORIGINS` (راجع `replit.md` و `.env.example`).

### ٤) البناء
```bash
pnpm run build      # يفحص الأنواع ويبني كل الحزم
```
المخرجات:
- خادم مدمج: `artifacts/api-server/dist/index.mjs`
- واجهة مبنية: `artifacts/erb-platform/dist/public/`

### ٥) التشغيل
```bash
STATIC_DIR=artifacts/erb-platform/dist/public \
  node artifacts/api-server/dist/index.mjs
```
الخادم يقدّم الواجهة والـ API معاً على نفس المنفذ.

---

## أوامر مفيدة
```bash
pnpm run typecheck   # فحص الأنواع فقط
pnpm run test        # اختبارات الخادم (vitest + supertest)
pnpm --filter @workspace/api-server run dev   # تشغيل تطوير مع إعادة بناء
pnpm --filter @workspace/erb-platform run dev # واجهة تطوير (proxy تلقائي للـ API)
pnpm --filter @workspace/api-spec run codegen # إعادة توليد عميل الـ API بعد تعديل openapi.yaml
```

## النشر على Hetzner
راجع **`HETZNER.md`** — Docker Compose + Nginx + Let's Encrypt.
باختصار على السيرفر:
```bash
cp .env.example .env   # عبّئ القيم
./deploy/deploy.sh
./deploy/enable-ssl.sh # بعد ربط النطاق
```

## ملاحظات
- **ويندوز:** أوامر pnpm تعمل عبر Git Bash. سكربت `dev` للخادم يستخدم `cross-env`
  فيعمل على ويندوز ولينكس معاً.
- راجع `replit.md` لخريطة المشروع الكاملة وقرارات التصميم، و `threat_model.md`
  لملاحظات الأمان.
