import { useEffect, useState } from "react";
import { MainNav } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  ApiError,
  useCreateProfile,
  useGetMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { ProfileInputRole } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Truck, UtensilsCrossed, Coffee, ShoppingCart, ArrowRight, ArrowLeft, Building2, Eye, EyeOff } from "lucide-react";

// ─── types ───────────────────────────────────────────────────────────────────

type AuthTab = "login" | "register";
type RegisterStep = 1 | 2 | 3;

interface BusinessRole {
  id: string;
  label: string;
  sub: string;
  desc: string;
  icon: React.ElementType;
  role: ProfileInputRole;
  business_type?: string;
}

const ROLES: BusinessRole[] = [
  {
    id: "supplier",
    label: "مورّد",
    sub: "Supplier",
    desc: "توريد وتوزيع المنتجات للمنشآت",
    icon: Truck,
    role: ProfileInputRole.supplier,
  },
  {
    id: "restaurant",
    label: "صاحب مطعم",
    sub: "Restaurant Owner",
    desc: "أبحث عن موردين لمطعمي",
    icon: UtensilsCrossed,
    role: ProfileInputRole.business_owner,
    business_type: "restaurant",
  },
  {
    id: "cafe",
    label: "صاحب كافيه",
    sub: "Café Owner",
    desc: "أبحث عن موردين لكافيهي",
    icon: Coffee,
    role: ProfileInputRole.business_owner,
    business_type: "cafe",
  },
  {
    id: "supermarket",
    label: "صاحب سوبرماركت",
    sub: "Supermarket Owner",
    desc: "أبحث عن موردين لسوبرماركتي",
    icon: ShoppingCart,
    role: ProfileInputRole.business_owner,
    business_type: "supermarket",
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

const inputClass =
  "w-full bg-white/[0.06] border border-white/[0.12] text-white placeholder:text-white/35 rounded-xl h-12 px-4 focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.09] transition text-sm";

// ─── component ───────────────────────────────────────────────────────────────

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProfile = useCreateProfile();
  const { session, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<AuthTab>("login");
  const [step, setStep] = useState<RegisterStep>(1);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const { data: existingProfile, error: profileError } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey(), retry: false },
  });

  // Signed-in users (fresh login, or returning from the Google OAuth redirect)
  // are routed by profile state: profile → dashboard, none yet → onboarding.
  // Skipped mid-registration so the email/password flow finishes its own steps.
  useEffect(() => {
    if (authLoading || !session || loading || createProfile.isPending) return;
    if (existingProfile) {
      setLocation("/dashboard");
    } else if (profileError instanceof ApiError && profileError.status === 404) {
      setLocation("/onboarding");
    }
  }, [authLoading, session, loading, createProfile.isPending, existingProfile, profileError, setLocation]);

  // login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // register step 1
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // register step 2
  const [selectedRole, setSelectedRole] = useState<BusinessRole | null>(null);

  // register step 3
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  // ── handlers ────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      // Navigation happens in the session effect above, which also routes
      // profile-less accounts to /onboarding instead of an empty dashboard.
    } catch (err: any) {
      toast({ title: "فشل تسجيل الدخول", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
  };

  const handleRegStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail || regPassword.length < 6) {
      toast({ title: "تحقق من البيانات", description: "البريد الإلكتروني وكلمة المرور (٦ أحرف على الأقل) مطلوبان", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleRegStep2 = () => {
    if (!selectedRole) {
      toast({ title: "اختر دورك أولاً", description: "يرجى اختيار نوع نشاطك التجاري", variant: "destructive" });
      return;
    }
    setStep(3);
  };

  const handleRegStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !companyName) {
      toast({ title: "جميع الحقول مطلوبة", description: "أدخل اسمك الكامل واسم الشركة أو المنشأة", variant: "destructive" });
      return;
    }
    if (!selectedRole) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: { data: { full_name: fullName, company_name: companyName, role: selectedRole.role } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("لم يتم إنشاء الحساب");

      await createProfile.mutateAsync({
        data: {
          email: regEmail,
          full_name: fullName,
          company_name: companyName,
          role: selectedRole.role,
          business_type: selectedRole.business_type,
          phone: phone || undefined,
        },
      });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "فشل إنشاء الحساب", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── layout ──────────────────────────────────────────────────────────────────

  const isStep2 = tab === "register" && step === 2;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-[#07111f] to-slate-950">
      {/* Subtle grid overlay */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]" />
      {/* Blue glow */}
      <div className="pointer-events-none fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-900/10 blur-[120px]" />

      <MainNav />

      <div className="flex-1 flex items-center justify-center p-4 py-12 relative z-10">
        {/* ── STEP 2: Role selection (wide) ── */}
        {isStep2 ? (
          <div className="w-full max-w-2xl">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 mb-4">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-2xl font-extrabold text-white mb-1">ما طبيعة نشاطك؟</h1>
              <p className="text-white/40 text-sm">Select your business type</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const selected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => setSelectedRole(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedRole(r);
                      }
                    }}
                    className={`cursor-pointer rounded-2xl p-6 border transition-all duration-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 ${
                      selected
                        ? "bg-blue-500/10 border-blue-500/60 shadow-lg shadow-blue-500/10"
                        : "bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.08] hover:border-white/[0.18]"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${selected ? "bg-blue-600/30" : "bg-white/[0.08]"}`}>
                      <Icon className={`h-6 w-6 ${selected ? "text-blue-400" : "text-white/60"}`} />
                    </div>
                    <div className={`text-lg font-extrabold mb-0.5 ${selected ? "text-white" : "text-white/80"}`}>{r.label}</div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${selected ? "text-blue-400" : "text-white/30"}`}>{r.sub}</div>
                    <div className="text-xs text-white/40 leading-snug">{r.desc}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 gap-2"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-4 w-4" />
                رجوع
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white gap-2"
                onClick={handleRegStep2}
              >
                التالي
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          /* ── Step 1 & 3 + Login card ── */
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 mb-4">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-2xl font-extrabold text-white">شركة توريدات مَـد</h1>
              <p className="text-white/35 text-xs mt-1 uppercase tracking-widest">Saudi Arabia</p>
            </div>

            {/* Glass card */}
            <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-3xl shadow-2xl p-8">

              {/* Heading — mode-aware */}
              {tab === "login" ? (
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">تسجيل الدخول</h2>
                  <p className="text-white/40 text-xs">أهلاً بعودتك، أدخل بياناتك للمتابعة</p>
                </div>
              ) : step === 1 ? (
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-extrabold text-white mb-1">إنشاء حساب جديد</h2>
                  <p className="text-white/40 text-xs">ابدأ رحلتك مع شركة توريدات مَـد</p>
                </div>
              ) : (
                /* Step indicator for step 3 */
                <div className="flex items-center gap-2 mb-8">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s <= step ? "bg-blue-600 text-white" : "bg-white/10 text-white/30"}`}>{s}</div>
                      {s < 3 && <div className={`flex-1 h-px ${s < step ? "bg-blue-600" : "bg-white/10"}`} />}
                    </div>
                  ))}
                </div>
              )}

              {/* ── LOGIN form ── */}
              {tab === "login" && (
                <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <Button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full h-12 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white hover:bg-white/[0.12] font-bold gap-3"
                    variant="ghost"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    المتابعة عبر Google
                  </Button>
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-white/[0.08]" />
                    <span className="text-white/30 text-xs">أو</span>
                    <div className="flex-1 h-px bg-white/[0.08]" />
                  </div>
                  <div className="space-y-3">
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="البريد الإلكتروني · Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        className={inputClass + " pl-12"}
                        placeholder="كلمة المرور · Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white mt-2"
                    disabled={loading}
                  >
                    {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول · Sign In"}
                  </Button>
                </form>
                <p className="text-center text-sm text-white/40 mt-6 pt-5 border-t border-white/[0.08]">
                  ليس لديك حساب؟{" "}
                  <button
                    type="button"
                    onClick={() => { setTab("register"); setStep(1); }}
                    className="text-blue-400 font-bold hover:text-blue-300 transition"
                    data-testid="link-goto-register"
                  >
                    سجّل الآن
                  </button>
                </p>
                </>
              )}

              {/* ── REGISTER step 1 ── */}
              {tab === "register" && step === 1 && (
                <>
                <form onSubmit={handleRegStep1} className="space-y-4">
                  <Button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full h-12 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white hover:bg-white/[0.12] font-bold gap-3"
                    variant="ghost"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    التسجيل عبر Google
                  </Button>
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-white/[0.08]" />
                    <span className="text-white/30 text-xs">أو</span>
                    <div className="flex-1 h-px bg-white/[0.08]" />
                  </div>
                  <div className="space-y-3">
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="البريد الإلكتروني · Email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        className={inputClass + " pl-12"}
                        placeholder="كلمة المرور (٦ أحرف على الأقل)"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white mt-2 gap-2"
                  >
                    التالي
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
                <p className="text-center text-sm text-white/40 mt-6 pt-5 border-t border-white/[0.08]">
                  لديك حساب بالفعل؟{" "}
                  <button
                    type="button"
                    onClick={() => { setTab("login"); setStep(1); }}
                    className="text-blue-400 font-bold hover:text-blue-300 transition"
                    data-testid="link-goto-login"
                  >
                    تسجيل الدخول
                  </button>
                </p>
                </>
              )}

              {/* ── REGISTER step 3 ── */}
              {tab === "register" && step === 3 && (
                <form onSubmit={handleRegStep3} className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] mb-2">
                    {selectedRole && (() => { const Icon = selectedRole.icon; return <Icon className="h-5 w-5 text-blue-400 shrink-0" />; })()}
                    <div>
                      <div className="text-sm font-bold text-white">{selectedRole?.label}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">{selectedRole?.sub}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="الاسم الكامل · Full Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      className={inputClass}
                      placeholder={selectedRole?.role === "supplier" ? "اسم الشركة · Company Name" : "اسم المنشأة · Business Name"}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                    />
                    <input
                      type="tel"
                      className={inputClass}
                      placeholder="رقم الجوال (اختياري) · Phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-12 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 gap-2"
                      onClick={() => setStep(2)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      رجوع
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white"
                      disabled={loading}
                    >
                      {loading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <p className="text-center text-white/20 text-xs mt-6">
              شركة توريدات مَـد — المملكة العربية السعودية · جميع الحقوق محفوظة
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
