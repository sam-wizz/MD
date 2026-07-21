import { useEffect } from "react";
import { MainNav } from "@/components/layout/main-nav";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Activity, Building2, Store, Users, MapPin, CheckCircle2, Clock, XCircle, LayoutDashboard, Handshake, Phone, Mail, Truck, UtensilsCrossed, Coffee, ShoppingCart } from "lucide-react";
import {
  ApiError,
  useGetMyProfile,
  useGetDashboardActivity,
  useGetPlatformStats,
  useGetPartners,
  getGetMyProfileQueryKey,
  getGetPartnersQueryKey
} from "@workspace/api-client-react";
import { BusinessOrdersCard } from "@/components/dashboard/business-orders-card";
import { InvoiceAnalyzerCard } from "@/components/dashboard/invoice-analyzer-card";
import { SupplierOrdersCard } from "@/components/dashboard/supplier-orders-card";
import { SupplierPricesCard } from "@/components/dashboard/supplier-prices-card";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/auth");
    }
  }, [user, authLoading, setLocation]);

  const { data: profile, isLoading: profileLoading, error: profileError } = useGetMyProfile(
    { query: { enabled: !!user?.id, queryKey: getGetMyProfileQueryKey(), retry: false } }
  );

  // Signed-in but no profile yet (e.g. Google OAuth signup) → complete it first.
  useEffect(() => {
    if (profileError instanceof ApiError && profileError.status === 404) {
      setLocation("/onboarding");
    }
  }, [profileError, setLocation]);

  const { data: activityList, isLoading: activityLoading } = useGetDashboardActivity();
  const { data: platformStats, isLoading: statsLoading } = useGetPlatformStats();
  const { data: partners, isLoading: partnersLoading } = useGetPartners(
    { query: { enabled: !!user?.id, queryKey: getGetPartnersQueryKey() } }
  );

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <MainNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <LayoutDashboard className="h-8 w-8 text-slate-300" />
            <div className="text-sm font-bold text-slate-500">جارٍ تحميل البيانات...</div>
            <div className="text-xs text-slate-400">Loading Dashboard</div>
          </div>
        </div>
      </div>
    );
  }

  const isPending  = profile?.status === "pending";
  const isApproved = profile?.status === "approved";
  const isRejected = profile?.status === "rejected";

  const roleLabel    = profile?.role === "supplier" ? "مورّد" : "صاحب عمل";
  const roleLabelEn  = profile?.role === "supplier" ? "Supplier" : "Business Owner";

  const statusLabel =
    isPending  ? "قيد المراجعة"  :
    isApproved ? "مفعّل"          :
    isRejected ? "مرفوض"          : "—";

  const statusLabelEn =
    isPending  ? "Pending Review" :
    isApproved ? "Active"         :
    isRejected ? "Rejected"       : "—";

  const activityTypeAr = (type: string) =>
    type === "registration" ? "تسجيل"  :
    type === "connection"   ? "ربط"    :
    type === "approval"     ? "موافقة" :
    type === "milestone"    ? "إنجاز"  :
    type === "update"       ? "تحديث"  : type;

  const isSupplier = profile?.role === "supplier";

  const bizTypeAr = (t?: string | null) =>
    t === "restaurant"  ? "مطعم"       :
    t === "cafe"        ? "كافيه"      :
    t === "supermarket" ? "سوبرماركت"  :
    t === "retail"      ? "تجزئة"      : "منشأة";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">لوحة التحكم</h1>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-0.5">Command Dashboard</p>
            <p className="text-slate-500 text-sm mt-2">
              مرحباً، <span className="font-bold text-slate-700 dark:text-slate-200">{profile?.full_name}</span> ·{" "}
              <span className="text-slate-400 text-xs">{profile?.company_name}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-white dark:bg-slate-900 border px-3 py-1.5 rounded-sm text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-sm">
              {profile?.role === "supplier" ? <Building2 className="h-4 w-4 text-zinc-800" /> : <Store className="h-4 w-4 text-zinc-800" />}
              {roleLabel} · {roleLabelEn}
            </div>
            {isPending && (
              <div className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-sm text-xs font-bold flex items-center gap-2 shadow-sm">
                <Clock className="h-4 w-4" /> قيد المراجعة · Pending
              </div>
            )}
            {isApproved && (
              <div className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-sm text-xs font-bold flex items-center gap-2 shadow-sm">
                <CheckCircle2 className="h-4 w-4" /> مفعّل · Active
              </div>
            )}
            {isRejected && (
              <div className="bg-red-100 text-red-800 border border-red-200 px-3 py-1.5 rounded-sm text-xs font-bold flex items-center gap-2 shadow-sm">
                <XCircle className="h-4 w-4" /> مرفوض · Rejected
              </div>
            )}
          </div>
        </div>

        {/* Pending Alert */}
        {isPending && (
          <Alert className="mb-8 border-zinc-200 bg-zinc-50 dark:bg-zinc-950/30 dark:border-zinc-900 rounded-sm shadow-sm" data-testid="alert-pending-approval">
            <AlertCircle className="h-5 w-5 text-zinc-800 dark:text-zinc-400" />
            <AlertTitle className="text-zinc-900 dark:text-zinc-300 font-extrabold text-sm mb-1">
              حسابك قيد المراجعة · Account Under Review
            </AlertTitle>
            <AlertDescription className="text-zinc-800 dark:text-zinc-400/80 text-sm leading-relaxed">
              سيتواصل معك فريق الإدارة قريباً للتحقق من بياناتك وتفعيل حسابك على المنصة.
              <br />
              <span className="text-zinc-600/70 text-xs">
                Our administration team will review your registration and contact you shortly to activate full platform access.
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">

            {/* Stats Cards */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">الموردون · Suppliers</CardDescription>
                  <CardTitle className="text-3xl text-slate-800 dark:text-slate-100">
                    {statsLoading ? "—" : platformStats?.total_suppliers}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> نشطون في الشبكة
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">أصحاب الأعمال · Retailers</CardDescription>
                  <CardTitle className="text-3xl text-slate-800 dark:text-slate-100">
                    {statsLoading ? "—" : platformStats?.total_retailers}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5" /> نشطون في الشبكة
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">المناطق · Regions</CardDescription>
                  <CardTitle className="text-3xl text-slate-800 dark:text-slate-100">
                    {statsLoading ? "—" : platformStats?.countries_served}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> مناطق المملكة المخدومة
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* أدوات صاحب المنشأة: الطلبات + مقارنة الفواتير */}
            {isApproved && !isSupplier && (
              <>
                <BusinessOrdersCard />
                <InvoiceAnalyzerCard />
              </>
            )}

            {/* أدوات المورد: الطلبات المسندة + قائمة الأسعار */}
            {isApproved && isSupplier && (
              <>
                <SupplierOrdersCard />
                <SupplierPricesCard />
              </>
            )}

            {/* Partner Directory */}
            <Card className="rounded-sm border-slate-200 shadow-sm" data-testid="card-partners">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                  <Handshake className="h-4 w-4 text-zinc-800" />
                  {isSupplier ? "منشآت تبحث عن موردين · Businesses" : "الموردون المعتمدون · Verified Suppliers"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 bg-white dark:bg-slate-950">
                {partnersLoading ? (
                  <div className="p-8 text-center text-sm font-medium text-slate-500">جارٍ تحميل الشركاء...</div>
                ) : !partners?.length ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-bold text-slate-500 mb-1">
                      {isSupplier ? "لا توجد منشآت معتمدة حالياً" : "لا يوجد موردون معتمدون حالياً"}
                    </p>
                    <p className="text-xs text-slate-400">سيظهر شركاؤك هنا فور اعتماد حساباتهم من الإدارة</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {partners.map((p) => (
                      <div key={p.id} className="p-4 flex flex-wrap items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors" data-testid={`row-partner-${p.id}`}>
                        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-900 p-2.5 rounded-sm shrink-0">
                          {p.role === "supplier"
                            ? <Truck className="h-5 w-5 text-zinc-800" />
                            : p.business_type === "cafe"
                            ? <Coffee className="h-5 w-5 text-zinc-800" />
                            : p.business_type === "supermarket"
                            ? <ShoppingCart className="h-5 w-5 text-zinc-800" />
                            : <UtensilsCrossed className="h-5 w-5 text-zinc-800" />}
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.company_name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {p.role === "supplier" ? "مورّد معتمد" : bizTypeAr(p.business_type)} · {p.full_name}
                            {p.country ? ` · ${p.country}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.phone && (
                            <a
                              href={`tel:${p.phone}`}
                              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-sm bg-zinc-900 text-white border border-zinc-600 hover:bg-zinc-700 transition-colors"
                              data-testid={`link-call-${p.id}`}
                            >
                              <Phone className="h-3.5 w-3.5" /> اتصال
                            </a>
                          )}
                          <a
                            href={`mailto:${p.email}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            data-testid={`link-email-${p.id}`}
                          >
                            <Mail className="h-3.5 w-3.5" /> مراسلة
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Feed */}
            <Card className="rounded-sm border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                  <Activity className="h-4 w-4 text-zinc-800" />
                  سجل نشاط الشبكة · Network Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 bg-white dark:bg-slate-950">
                {activityLoading ? (
                  <div className="p-8 text-center text-sm font-medium text-slate-500">جارٍ تحميل الأنشطة...</div>
                ) : !activityList?.length ? (
                  <div className="p-8 text-center text-sm font-medium text-slate-500">لا توجد أنشطة حديثة · No recent activity</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {activityList.map((item) => (
                      <div key={item.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex gap-4 items-start">
                        <div className="mt-0.5 bg-slate-100 dark:bg-slate-800 p-2 rounded-full shrink-0">
                          {item.type === "registration" && <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />}
                          {item.type === "connection"   && <Activity className="h-4 w-4 text-zinc-800 dark:text-zinc-400" />}
                          {item.type === "approval"     && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                          {(item.type !== "registration" && item.type !== "connection" && item.type !== "approval") &&
                            <Activity className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.message}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{activityTypeAr(item.type)}</span>
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-[10px] font-medium text-slate-400">
                              {new Date(item.timestamp).toLocaleString("ar-SA")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar — Profile Card */}
          <div>
            <Card className="rounded-sm border-slate-200 shadow-sm sticky top-24">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                <CardTitle className="text-base font-bold text-slate-700 dark:text-slate-200">
                  بيانات الملف الشخصي · Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-5 bg-white dark:bg-slate-950">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">الشركة · Company</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{profile?.company_name}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">الاسم · Name</div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile?.full_name}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">البريد الإلكتروني · Email</div>
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 break-all">{profile?.email}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">الدور · Role</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {roleLabel} <span className="text-slate-400 font-normal text-xs">· {roleLabelEn}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">الحالة · Status</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${isApproved ? "bg-emerald-500" : isPending ? "bg-amber-500" : "bg-red-500"}`} />
                    {statusLabel} <span className="text-slate-400 font-normal text-xs">· {statusLabelEn}</span>
                  </div>
                </div>
                {profile?.created_at && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      تاريخ التسجيل · {new Date(profile.created_at).toLocaleDateString("ar-SA")}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
