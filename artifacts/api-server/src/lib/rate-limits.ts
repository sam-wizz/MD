import rateLimit from "express-rate-limit";

/** حد إنشاء الطلبات أضيق من حد الكتابة العام */
export const orderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تجاوزت حد إنشاء الطلبات — حاول بعد دقيقة" },
});
