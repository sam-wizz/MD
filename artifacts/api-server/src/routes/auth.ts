import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";

const router = Router();

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// حد محاولات الدخول الفاشلة فقط (لا تُحسب الناجحة)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "محاولات دخول كثيرة. حاول مرة أخرى بعد ١٥ دقيقة." },
});

const loginBodySchema = z.object({
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

/**
 * POST /api/auth/login
 * وكيل تسجيل الدخول عبر Supabase مع حد للمحاولات الفاشلة على مستوى الخادم.
 */
router.post("/login", loginLimiter, async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "إعدادات المصادقة غير مكتملة على الخادم" });
  }

  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
    });
  }

  const { email, password } = parsed.data;

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

    if (!resp.ok) {
      const msg = typeof payload.msg === "string"
        ? payload.msg
        : typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : "فشل تسجيل الدخول";

      // رسائل عربية شائعة
      const lower = msg.toLowerCase();
      let arabic = "البريد أو كلمة المرور غير صحيحة";
      if (lower.includes("confirm") || lower.includes("not confirmed")) {
        arabic = "يرجى تأكيد البريد الإلكتروني قبل تسجيل الدخول";
      } else if (lower.includes("too many")) {
        arabic = "محاولات كثيرة. حاول لاحقاً";
      }

      return res.status(401).json({ error: arabic });
    }

    const access_token = payload.access_token;
    const refresh_token = payload.refresh_token;
    const expires_in = payload.expires_in;
    const token_type = payload.token_type;
    const user = payload.user;

    if (typeof access_token !== "string" || typeof refresh_token !== "string") {
      return res.status(502).json({ error: "استجابة مصادقة غير مكتملة" });
    }

    return res.json({
      access_token,
      refresh_token,
      expires_in,
      token_type: typeof token_type === "string" ? token_type : "bearer",
      user,
    });
  } catch (err) {
    req.log.error({ err }, "Login proxy failed");
    return res.status(500).json({ error: "تعذر الاتصال بخدمة المصادقة" });
  }
});

export default router;
