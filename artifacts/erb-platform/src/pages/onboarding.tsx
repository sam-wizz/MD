import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCreateProfile } from "@workspace/api-client-react";
import { ProfileInputRole } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Truck, UtensilsCrossed, Coffee, ShoppingCart, ArrowRight, ArrowLeft } from "lucide-react";
import { MaddMark } from "@/components/layout/main-nav";

const ROLES = [
  { id: "supplier",     label: "مورّد",           sub: "Supplier",          desc: "توريد وتوزيع المنتجات للمنشآت", icon: Truck,           role: ProfileInputRole.supplier },
  { id: "restaurant",   label: "صاحب مطعم",       sub: "Restaurant Owner",  desc: "أبحث عن موردين لمطعمي",        icon: UtensilsCrossed, role: ProfileInputRole.business_owner, business_type: "restaurant" },
  { id: "cafe",         label: "صاحب كافيه",      sub: "Café Owner",        desc: "أبحث عن موردين لكافيهي",       icon: Coffee,          role: ProfileInputRole.business_owner, business_type: "cafe" },
  { id: "supermarket",  label: "صاحب سوبرماركت",  sub: "Supermarket Owner", desc: "أبحث عن موردين لسوبرماركتي",   icon: ShoppingCart,    role: ProfileInputRole.business_owner, business_type: "supermarket" },
];

const inputClass =
  "w-full bg-white/[0.06] border border-white/[0.12] text-white placeholder:text-white/35 rounded-xl h-12 px-4 focus:outline-none focus:border-zinc-500/60 focus:bg-white/[0.09] transition text-sm";

export default function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createProfile = useCreateProfile();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation(`/auth?redirect=${encodeURIComponent("/onboarding")}`);
    }
  }, [authLoading, user, setLocation]);

  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<typeof ROLES[0] | null>(null);
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? "");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStep1 = () => {
    if (!selected) {
      toast({ title: "اختر نوع نشاطك", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selected) return;
    if (!fullName || !companyName) {
      toast({ title: "جميع الحقول مطلوبة", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await createProfile.mutateAsync({
        data: {
          email: user.email ?? "",
          full_name: fullName,
          company_name: companyName,
          role: selected.role,
          business_type: selected.business_type,
          phone: phone || undefined,
        },
      });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "حدث خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-[#07111f] to-slate-950 p-4 relative">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]" />
      <div className="pointer-events-none fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-zinc-600/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-10">
          <MaddMark className="inline-block h-12 w-12 text-zinc-300 mb-4" />
          <h1 className="text-2xl font-extrabold text-white">أهلاً بك</h1>
          <p className="text-white/40 text-sm mt-1">لنكتمل إعداد حسابك · Let's complete your profile</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 max-w-xs mx-auto">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${s <= step ? "bg-zinc-900 text-white" : "bg-white/10 text-white/30"}`}>{s}</div>
              {s < 2 && <div className={`flex-1 h-px ${s < step ? "bg-zinc-900" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-white">ما طبيعة نشاطك التجاري؟</h2>
              <p className="text-white/35 text-xs mt-1">What is your business type?</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-8">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const active = selected?.id === r.id;
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                    className={`cursor-pointer rounded-2xl p-6 border transition-all duration-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/70 ${active ? "bg-zinc-500/10 border-zinc-500/60 shadow-lg shadow-zinc-500/10" : "bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.08] hover:border-white/[0.18]"}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${active ? "bg-zinc-600/30" : "bg-white/[0.08]"}`}>
                      <Icon className={`h-6 w-6 ${active ? "text-zinc-400" : "text-white/60"}`} />
                    </div>
                    <div className={`text-lg font-extrabold mb-0.5 ${active ? "text-white" : "text-white/80"}`}>{r.label}</div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${active ? "text-zinc-400" : "text-white/30"}`}>{r.sub}</div>
                    <div className="text-xs text-white/40 leading-snug">{r.desc}</div>
                  </div>
                );
              })}
            </div>
            <Button onClick={handleStep1} className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white gap-2">
              التالي · Next <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Step 2: Profile completion */}
        {step === 2 && (
          <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] mb-6">
              {selected && (() => { const Icon = selected.icon; return <Icon className="h-5 w-5 text-zinc-400 shrink-0" />; })()}
              <div>
                <div className="text-sm font-bold text-white">{selected?.label}</div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest">{selected?.sub}</div>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" className={inputClass} placeholder="الاسم الكامل · Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <input type="text" className={inputClass} placeholder={selected?.role === "supplier" ? "اسم الشركة · Company Name" : "اسم المنشأة · Business Name"} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              <input type="tel" className={inputClass} placeholder="رقم الجوال (اختياري) · Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <div className="flex gap-3 mt-2">
                <Button type="button" variant="outline" className="flex-1 h-12 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 gap-2" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> رجوع
                </Button>
                <Button type="submit" className="flex-1 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white" disabled={loading}>
                  {loading ? "جارٍ الحفظ..." : "إتمام التسجيل"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
