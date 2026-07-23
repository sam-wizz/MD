import { z } from "zod";

/** جوال سعودي: 05XXXXXXXX أو +9665XXXXXXXX */
export const saudiPhoneRegex = /^(05\d{8}|\+9665\d{8})$/;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("صيغة البريد الإلكتروني غير صحيحة"),
});

export const resetSchema = z
  .object({
    password: z.string().min(8, "كلمة المرور يجب أن تكون ٨ أحرف على الأقل"),
    confirmPassword: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "الاسم الكامل مطلوب"),
    email: z
      .string()
      .trim()
      .min(1, "البريد الإلكتروني مطلوب")
      .email("صيغة البريد الإلكتروني غير صحيحة"),
    password: z.string().min(8, "كلمة المرور يجب أن تكون ٨ أحرف على الأقل"),
    confirmPassword: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
    company_name: z.string().trim().min(2, "اسم المنشأة / الشركة مطلوب"),
    role: z.enum(["supplier", "business_owner"], {
      errorMap: () => ({ message: "اختر نوع الحساب" }),
    }),
    business_type: z
      .enum(["restaurant", "cafe", "supermarket", "retail"])
      .optional(),
    phone: z
      .string()
      .trim()
      .min(1, "رقم الجوال مطلوب")
      .regex(saudiPhoneRegex, "صيغة الجوال غير صحيحة (05XXXXXXXX أو +9665XXXXXXXX)"),
    region: z.string().trim().min(2, "المدينة / المنطقة مطلوبة"),
    acceptTerms: z
      .boolean()
      .refine((v) => v === true, { message: "يجب الموافقة على الشروط والأحكام" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  })
  .superRefine((d, ctx) => {
    if (d.role === "business_owner" && !d.business_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "اختر نوع المنشأة",
        path: ["business_type"],
      });
    }
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;

/** مقياس قوة كلمة المرور (٠–٤) */
export function passwordStrength(password: string): {
  score: number;
  label: string;
} {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"];
  return { score, label: labels[score] ?? labels[0] };
}
