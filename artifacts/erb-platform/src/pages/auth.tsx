import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  ProfileInputRole,
  useCreateProfile,
  useGetMyAccess,
  useGetMyProfile,
  getGetMyAccessQueryKey,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { Eye, EyeOff, Clock, XCircle, Mail } from "lucide-react";

import { MainNav, MaddMark } from "@/components/layout/main-nav";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import {
  authModeFromSearch,
  destinationForProfile,
  readRedirectParam,
} from "@/lib/auth-redirect";
import {
  forgotSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  type ForgotValues,
  type LoginValues,
  type RegisterValues,
  type ResetValues,
} from "@/lib/auth-validation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/orders";

type AuthView =
  | "login"
  | "register"
  | "forgot"
  | "reset"
  | "pending"
  | "rejected";

const SUPPORT_EMAIL = "support@madd.sa";
const SUPPORT_PHONE = "920000000";

const inputClass =
  "bg-white/[0.06] border-white/[0.12] text-white placeholder:text-white/35 h-11 focus-visible:ring-zinc-500/40";

function mapSupabaseSignUpError(message: string): { text: string; alreadyRegistered?: boolean } {
  const lower = message.toLowerCase();
  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists") ||
    lower.includes("email address is already")
  ) {
    return {
      text: "هذا البريد مسجّل مسبقاً. يمكنك تسجيل الدخول بدل إنشاء حساب جديد.",
      alreadyRegistered: true,
    };
  }
  return { text: message || "تعذر إنشاء الحساب" };
}

export default function Auth() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { session, loading: authLoading, signOut } = useAuth();
  const createProfile = useCreateProfile();

  const initialMode = (authModeFromSearch(search) as AuthView | null) ?? "login";
  const [view, setView] = useState<AuthView>(
    ["login", "register", "forgot", "reset", "pending", "rejected"].includes(initialMode)
      ? initialMode
      : "login",
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [routing, setRouting] = useState(false);

  const redirectTo = useMemo(() => readRedirectParam(search), [search]);

  const {
    data: profile,
    error: profileError,
    isFetching: profileFetching,
    isError: profileIsError,
    refetch: refetchProfile,
  } = useGetMyProfile({
    query: {
      enabled: !!session,
      queryKey: getGetMyProfileQueryKey(),
      retry: 1,
    },
  });

  const queryClient = useQueryClient();

  const { data: access } = useGetMyAccess({
    query: { enabled: !!session, queryKey: getGetMyAccessQueryKey() },
  });

  // مزامنة ?mode= من الرابط (استعادة كلمة المرور / شاشات الحالة)
  useEffect(() => {
    const mode = authModeFromSearch(search) as AuthView | null;
    if (mode && mode !== view) {
      if (["login", "register", "forgot", "reset", "pending", "rejected"].includes(mode)) {
        setView(mode);
      }
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // اكتشاف جلسة استعادة كلمة المرور من رابط Supabase
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    if (params.get("type") === "recovery") {
      setView("reset");
    }
  }, []);

  // توجيه بعد الدخول حسب الحالة والدور
  useEffect(() => {
    if (authLoading || !session || submitting || createProfile.isPending) return;
    if (view === "reset" || view === "forgot" || view === "register") return;
    if (view === "pending" || view === "rejected") return;
    if (profileFetching && !profile) return;

    if (profileError instanceof ApiError && profileError.status === 404) {
      setLocation("/onboarding");
      return;
    }
    // خطأ شبكة/خادم — لا تبقَ صامتاً على شاشة الدخول
    if (profileIsError && !(profileError instanceof ApiError && profileError.status === 404)) {
      setServerError(
        apiErrorMessage(profileError, "تعذر تحميل ملفك بعد الدخول — تحقق من الاتصال وأعد المحاولة"),
      );
      return;
    }
    if (!profile) return;

    setRouting(true);
    if (profile.status === "pending") {
      setView("pending");
      setRouting(false);
      return;
    }
    if (profile.status === "rejected") {
      setView("rejected");
      setRouting(false);
      return;
    }

    const dest =
      redirectTo ||
      (access?.is_admin || profile.is_admin
        ? "/admin"
        : destinationForProfile(profile));
    setLocation(dest);
  }, [
    authLoading,
    session,
    submitting,
    createProfile.isPending,
    profile,
    profileError,
    profileIsError,
    profileFetching,
    access,
    redirectTo,
    setLocation,
    view,
  ]);
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirmPassword: "",
      company_name: "",
      role: undefined,
      business_type: undefined,
      phone: "",
      region: "",
      acceptTerms: false,
    },
    mode: "onBlur",
  });

  const forgotForm = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const watchedRole = registerForm.watch("role");
  const watchedPassword = registerForm.watch("password");

  const switchView = (next: AuthView) => {
    setServerError(null);
    setEmailTaken(false);
    setForgotSent(false);
    setView(next);
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    if (next === "login") params.delete("mode");
    else params.set("mode", next);
    const q = params.toString();
    window.history.replaceState(null, "", q ? `/auth?${q}` : "/auth");
  };

  const handleLogin = loginForm.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      if (!isSupabaseConfigured) {
        setServerError(
          "إعدادات المصادقة غير مكتملة على الواجهة (VITE_SUPABASE_URL / مفتاح anon). راجع إعدادات النشر.",
        );
        return;
      }

      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          password: values.password,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        access_token?: string;
        refresh_token?: string;
      };

      if (!resp.ok) {
        setServerError(data.error || "فشل تسجيل الدخول");
        return;
      }
      if (!data.access_token || !data.refresh_token) {
        setServerError("استجابة غير مكتملة من الخادم");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) throw error;

      // إجبار إعادة جلب الملف والصلاحيات فوراً بعد تثبيت الجلسة
      await queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetMyAccessQueryKey() });
      await refetchProfile();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  });

  const handleRegister = registerForm.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    setEmailTaken(false);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.full_name,
            company_name: values.company_name,
            role: values.role,
          },
        },
      });
      if (error) {
        const mapped = mapSupabaseSignUpError(error.message);
        setServerError(mapped.text);
        setEmailTaken(!!mapped.alreadyRegistered);
        return;
      }
      if (!data.user) {
        setServerError("لم يتم إنشاء الحساب");
        return;
      }

      // إن تطلب Supabase تأكيد البريد قد لا توجد جلسة فورية
      if (!data.session) {
        setServerError(
          "تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول.",
        );
        switchView("login");
        return;
      }

      await createProfile.mutateAsync({
        data: {
          email: values.email,
          full_name: values.full_name,
          company_name: values.company_name,
          role: values.role as ProfileInputRole,
          business_type:
            values.role === "business_owner" ? values.business_type : undefined,
          phone: values.phone,
          region: values.region,
          country: "المملكة العربية السعودية",
        },
      });

      setView("pending");
      window.history.replaceState(null, "", "/auth?mode=pending");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError(String(err.message || "فشل حفظ الملف الشخصي"));
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("فشل إنشاء الحساب");
      }
    } finally {
      setSubmitting(false);
    }
  });

  const handleForgot = forgotForm.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}${base}/auth?mode=reset`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "تعذر إرسال رابط الاستعادة");
    } finally {
      setSubmitting(false);
    }
  });

  const handleReset = resetForm.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      setServerError(null);
      switchView("login");
      setServerError("تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "تعذر تحديث كلمة المرور");
    } finally {
      setSubmitting(false);
    }
  });

  const busy = submitting || createProfile.isPending;

  if (!authLoading && session && routing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-[#07111f] to-slate-950">
        <Spinner className="h-8 w-8 text-zinc-400" aria-label="جارٍ التوجيه" />
        <p className="mt-3 text-sm font-bold text-white/70">جارٍ توجيهك...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-[#07111f] to-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]" />
      <MainNav />

      <div className="flex-1 flex items-center justify-center p-4 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <MaddMark className="inline-block h-12 w-12 text-zinc-300 mb-4" />
            <h1 className="text-2xl font-extrabold text-white">شركة توريدات مَـد</h1>
            <p className="text-white/35 text-xs mt-1 tracking-widest">المملكة العربية السعودية</p>
          </div>

          <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-3xl shadow-2xl p-8">
            {/* ── قيد المراجعة ── */}
            {view === "pending" && (
              <div className="text-center space-y-4" role="status">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-amber-400" aria-hidden />
                </div>
                <h2 className="text-xl font-extrabold text-white">تم تسجيل الدخول — بانتظار الاعتماد</h2>
                <p className="text-sm text-white/55 leading-relaxed">
                  حسابك يعمل، لكن <strong className="text-white/80">لوحة التحكم</strong> تُفتح فقط بعد موافقة الإدارة.
                  إن كنت مورّداً أو صاحب منشأة جديداً، راجع بريدك أو انتظر إشعار الاعتماد.
                  المدير يعتمد الحسابات من تبويب «الحسابات» في لوحة الإدارة.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={async () => {
                    await signOut();
                    switchView("login");
                  }}
                >
                  تسجيل الخروج
                </Button>
              </div>
            )}

            {/* ── مرفوض ── */}
            {view === "rejected" && (
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
                  <XCircle className="h-7 w-7 text-red-400" aria-hidden />
                </div>
                <h2 className="text-xl font-extrabold text-white">تم رفض الحساب</h2>
                <Alert variant="destructive" className="text-right border-red-500/30 bg-red-500/10">
                  <AlertTitle>سبب الرفض</AlertTitle>
                  <AlertDescription>
                    {profile?.rejection_reason?.trim() ||
                      "لم يُذكر سبب تفصيلي. يرجى التواصل مع الدعم للمزيد من المعلومات."}
                  </AlertDescription>
                </Alert>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60 space-y-2 text-right">
                  <p className="font-bold text-white/80">تواصل معنا</p>
                  <p className="flex items-center gap-2 justify-start">
                    <Mail className="h-4 w-4" aria-hidden />
                    <a className="underline hover:text-white" href={`mailto:${SUPPORT_EMAIL}`}>
                      {SUPPORT_EMAIL}
                    </a>
                  </p>
                  <p>هاتف: {SUPPORT_PHONE}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={async () => {
                    await signOut();
                    switchView("login");
                  }}
                >
                  تسجيل الخروج
                </Button>
              </div>
            )}

            {/* ── دخول ── */}
            {view === "login" && (
              <>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">تسجيل الدخول</h2>
                  <p className="text-white/40 text-xs">أهلاً بعودتك — أدخل بياناتك للمتابعة</p>
                </div>

                {serverError && (
                  <Alert variant="destructive" className="mb-4 text-right" role="alert">
                    <AlertTitle>تعذر تسجيل الدخول</AlertTitle>
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                <Form {...loginForm}>
                  <form onSubmit={handleLogin} className="space-y-4" noValidate>
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              autoComplete="email"
                              className={inputClass}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">كلمة المرور</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPass ? "text" : "password"}
                                autoComplete="current-password"
                                className={cn(inputClass, "pl-11")}
                                {...field}
                              />
                              <button
                                type="button"
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70"
                                aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                                onClick={() => setShowPass((v) => !v)}
                              >
                                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-start">
                      <button
                        type="button"
                        className="text-xs text-zinc-400 hover:text-zinc-300 font-bold"
                        onClick={() => switchView("forgot")}
                      >
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold gap-2"
                      disabled={busy}
                    >
                      {busy ? (
                        <>
                          <Spinner className="text-white" aria-label="جارٍ تسجيل الدخول" />
                          جارٍ تسجيل الدخول...
                        </>
                      ) : (
                        "تسجيل الدخول"
                      )}
                    </Button>
                  </form>
                </Form>

                <p className="text-center text-sm text-white/40 mt-6 pt-5 border-t border-white/[0.08]">
                  ليس لديك حساب؟{" "}
                  <button
                    type="button"
                    onClick={() => switchView("register")}
                    className="text-zinc-400 font-bold hover:text-zinc-300"
                  >
                    سجّل الآن
                  </button>
                </p>
              </>
            )}

            {/* ── تسجيل ── */}
            {view === "register" && (
              <>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">إنشاء حساب جديد</h2>
                  <p className="text-white/40 text-xs">انضم إلى منصة توريدات مَـد</p>
                </div>

                {serverError && (
                  <Alert variant="destructive" className="mb-4 text-right" role="alert">
                    <AlertTitle>تعذر إنشاء الحساب</AlertTitle>
                    <AlertDescription>
                      {serverError}
                      {emailTaken && (
                        <>
                          {" "}
                          <button
                            type="button"
                            className="underline font-bold"
                            onClick={() => switchView("login")}
                          >
                            سجّل الدخول بدل ذلك
                          </button>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <Form {...registerForm}>
                  <form onSubmit={handleRegister} className="space-y-4" noValidate>
                    <FormField
                      control={registerForm.control}
                      name="full_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">الاسم الكامل</FormLabel>
                          <FormControl>
                            <Input className={inputClass} autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <Input type="email" className={inputClass} autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">كلمة المرور</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPass ? "text" : "password"}
                                autoComplete="new-password"
                                className={cn(inputClass, "pl-11")}
                                {...field}
                              />
                              <button
                                type="button"
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70"
                                aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                                onClick={() => setShowPass((v) => !v)}
                              >
                                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <PasswordStrengthMeter password={watchedPassword || ""} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">تأكيد كلمة المرور</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirm ? "text" : "password"}
                                autoComplete="new-password"
                                className={cn(inputClass, "pl-11")}
                                {...field}
                              />
                              <button
                                type="button"
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70"
                                aria-label={showConfirm ? "إخفاء التأكيد" : "إظهار التأكيد"}
                                onClick={() => setShowConfirm((v) => !v)}
                              >
                                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="company_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">
                            {watchedRole === "supplier" ? "اسم الشركة" : "اسم المنشأة"}
                          </FormLabel>
                          <FormControl>
                            <Input className={inputClass} autoComplete="organization" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">نوع الحساب</FormLabel>
                          <Select
                            dir="rtl"
                            onValueChange={(v) => {
                              field.onChange(v);
                              if (v === "supplier") {
                                registerForm.setValue("business_type", undefined);
                              }
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className={inputClass}>
                                <SelectValue placeholder="اختر نوع الحساب" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="supplier">مورّد</SelectItem>
                              <SelectItem value="business_owner">صاحب منشأة</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedRole === "business_owner" && (
                      <FormField
                        control={registerForm.control}
                        name="business_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">نوع المنشأة</FormLabel>
                            <Select dir="rtl" onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className={inputClass}>
                                  <SelectValue placeholder="اختر نوع المنشأة" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="restaurant">مطعم</SelectItem>
                                <SelectItem value="cafe">كافيه</SelectItem>
                                <SelectItem value="supermarket">سوبرماركت</SelectItem>
                                <SelectItem value="retail">تجزئة</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={registerForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">رقم الجوال</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              inputMode="tel"
                              dir="ltr"
                              className={cn(inputClass, "text-left")}
                              placeholder="05XXXXXXXX"
                              autoComplete="tel"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">المدينة / المنطقة</FormLabel>
                          <FormControl>
                            <Input className={inputClass} placeholder="مثل: الرياض" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="acceptTerms"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value === true}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-white/75 text-sm font-normal cursor-pointer">
                              أوافق على الشروط والأحكام وسياسة الخصوصية
                            </FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold gap-2"
                      disabled={busy}
                    >
                      {busy ? (
                        <>
                          <Spinner className="text-white" aria-label="جارٍ إنشاء الحساب" />
                          جارٍ إنشاء الحساب...
                        </>
                      ) : (
                        "إنشاء الحساب"
                      )}
                    </Button>
                  </form>
                </Form>

                <p className="text-center text-sm text-white/40 mt-6 pt-5 border-t border-white/[0.08]">
                  لديك حساب؟{" "}
                  <button
                    type="button"
                    onClick={() => switchView("login")}
                    className="text-zinc-400 font-bold hover:text-zinc-300"
                  >
                    تسجيل الدخول
                  </button>
                </p>
              </>
            )}

            {/* ── نسيت كلمة المرور ── */}
            {view === "forgot" && (
              <>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">استعادة كلمة المرور</h2>
                  <p className="text-white/40 text-xs">سنرسل رابط إعادة التعيين إلى بريدك</p>
                </div>

                {serverError && (
                  <Alert variant="destructive" className="mb-4 text-right" role="alert">
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}
                {forgotSent && (
                  <Alert className="mb-4 text-right border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
                    <AlertTitle>تم الإرسال</AlertTitle>
                    <AlertDescription>
                      إن وُجد حساب بهذا البريد فستصلك رسالة تحتوي رابط إعادة التعيين.
                    </AlertDescription>
                  </Alert>
                )}

                <Form {...forgotForm}>
                  <form onSubmit={handleForgot} className="space-y-4" noValidate>
                    <FormField
                      control={forgotForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <Input type="email" className={inputClass} autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold gap-2"
                      disabled={busy || forgotSent}
                    >
                      {busy ? (
                        <>
                          <Spinner className="text-white" aria-label="جارٍ الإرسال" />
                          جارٍ الإرسال...
                        </>
                      ) : (
                        "إرسال رابط الاستعادة"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-white/60 hover:text-white"
                      onClick={() => switchView("login")}
                    >
                      العودة لتسجيل الدخول
                    </Button>
                  </form>
                </Form>
              </>
            )}

            {/* ── إعادة تعيين ── */}
            {view === "reset" && (
              <>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">تعيين كلمة مرور جديدة</h2>
                  <p className="text-white/40 text-xs">اختر كلمة مرور قوية لحسابك</p>
                </div>

                {serverError && (
                  <Alert
                    variant={serverError.includes("تم تحديث") ? "default" : "destructive"}
                    className="mb-4 text-right"
                    role="alert"
                  >
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                <Form {...resetForm}>
                  <form onSubmit={handleReset} className="space-y-4" noValidate>
                    <FormField
                      control={resetForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">كلمة المرور الجديدة</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              className={inputClass}
                              {...field}
                            />
                          </FormControl>
                          <PasswordStrengthMeter password={field.value || ""} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={resetForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">تأكيد كلمة المرور</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              className={inputClass}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold gap-2"
                      disabled={busy}
                    >
                      {busy ? (
                        <>
                          <Spinner className="text-white" aria-label="جارٍ الحفظ" />
                          جارٍ الحفظ...
                        </>
                      ) : (
                        "حفظ كلمة المرور"
                      )}
                    </Button>
                  </form>
                </Form>
              </>
            )}
          </div>

          <p className="text-center text-white/20 text-xs mt-6">
            شركة توريدات مَـد — جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </div>
  );
}
