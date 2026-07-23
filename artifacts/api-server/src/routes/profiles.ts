import { Router } from "express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const saudiPhoneSchema = z
  .string()
  .trim()
  .regex(/^(05\d{8}|\+9665\d{8})$/, "صيغة الجوال غير صحيحة (05XXXXXXXX أو +9665XXXXXXXX)");

/** البريد يُؤخذ من الجلسة فقط — لا يُقبل من الجسم */
const profileInputSchema = z
  .object({
    full_name: z.string().trim().min(2, "الاسم الكامل مطلوب"),
    company_name: z.string().trim().min(2, "اسم المنشأة / الشركة مطلوب"),
    role: z.enum(["supplier", "business_owner", "logistics"]),
    business_type: z
      .enum(["restaurant", "cafe", "supermarket", "retail"])
      .optional()
      .nullable(),
    phone: saudiPhoneSchema.optional().nullable(),
    industry: z.string().trim().optional().nullable(),
    country: z.string().trim().optional().nullable(),
    region: z.string().trim().min(2, "المدينة / المنطقة مطلوبة").optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "business_owner" && !data.business_type) {
      ctx.addIssue({
        code: "custom",
        message: "نوع المنشأة مطلوب لأصحاب الأعمال",
        path: ["business_type"],
      });
    }
  });

const serializeProfile = (p: typeof profilesTable.$inferSelect) => ({
  ...p,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

router.get("/me", requireAuth, async (req, res) => {
  const user_id = req.userId!;
  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    if (profiles.length === 0) {
      return res.status(404).json({ error: "الملف الشخصي غير موجود" });
    }
    return res.json(serializeProfile(profiles[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch profile");
    return res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const user_id = req.userId!;
  const sessionEmail = (req.userEmail || "").trim().toLowerCase();
  if (!sessionEmail) {
    return res.status(400).json({ error: "لا يمكن إنشاء الملف بدون بريد الجلسة" });
  }

  // تجاهل أي هوية قادمة من العميل
  const body = { ...(req.body ?? {}) } as Record<string, unknown>;
  delete body.user_id;
  delete body.email;
  delete body.is_admin;
  delete body.status;

  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
    });
  }

  const { full_name, company_name, role, business_type, phone, industry, country, region } =
    parsed.data;

  try {
    const existing = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    const isUpdate = existing.length > 0;
    let profile;

    if (isUpdate) {
      // الدور لا يُغيَّر بعد الإنشاء إلا عبر الإدارة
      const updated = await db
        .update(profilesTable)
        .set({
          email: sessionEmail,
          full_name,
          company_name,
          business_type: business_type || null,
          phone: phone || null,
          industry: industry || null,
          country: country || null,
          region: region || null,
          updated_at: new Date(),
        })
        .where(eq(profilesTable.user_id, user_id))
        .returning();
      profile = updated[0];
    } else {
      const inserted = await db
        .insert(profilesTable)
        .values({
          user_id,
          email: sessionEmail,
          full_name,
          company_name,
          role,
          business_type: business_type || null,
          phone: phone || null,
          industry: industry || null,
          country: country || null,
          region: region || null,
          status: "pending",
        })
        .returning();
      profile = inserted[0];
    }

    return res.status(isUpdate ? 200 : 201).json(serializeProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to create profile");
    return res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
});

export default router;
