import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  ApiError,
  useGetMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BusinessDashboardView } from "@/components/dashboard/business-dashboard";
import { SupplierDashboardView } from "@/components/dashboard/supplier-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardErrorState } from "@/components/dashboard/query-state";
import { apiErrorMessage } from "@/lib/orders";

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation(`/auth?redirect=${encodeURIComponent("/dashboard")}`);
    }
  }, [user, authLoading, setLocation]);

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch,
    isError,
  } = useGetMyProfile({
    query: {
      enabled: !!user?.id,
      queryKey: getGetMyProfileQueryKey(),
      retry: 1,
    },
  });

  useEffect(() => {
    if (profileError instanceof ApiError && profileError.status === 404) {
      setLocation("/onboarding");
      return;
    }
    if (!profile) return;
    if (profile.status === "pending") {
      setLocation("/auth?mode=pending");
      return;
    }
    if (profile.status === "rejected") {
      setLocation("/auth?mode=rejected");
    }
  }, [profileError, profile, setLocation]);

  if (authLoading || profileLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 space-y-4">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && !(profileError instanceof ApiError && profileError.status === 404)) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
        <DashboardErrorState
          message={apiErrorMessage(profileError, "تعذر تحميل الملف الشخصي")}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // بانتظار التوجيه لشاشة pending/rejected — لا تُبقِ هيكلًا إلى ما لا نهاية
  if (profile && (profile.status === "pending" || profile.status === "rejected")) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <Card className="max-w-md w-full rounded-sm">
          <CardHeader>
            <CardTitle className="text-base font-extrabold">
              {profile.status === "pending" ? "حسابك قيد المراجعة" : "تم رفض الحساب"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              {profile.status === "pending"
                ? "سجّلت الدخول بنجاح، لكن لوحة التحكم تفتح بعد اعتماد الإدارة لحسابك."
                : "لا يمكن الوصول للوحة التحكم حالياً. تواصل مع الدعم إن لزم."}
            </p>
            <div className="flex gap-2">
              <Button
                className="rounded-sm"
                onClick={() => setLocation(`/auth?mode=${profile.status}`)}
              >
                عرض الحالة
              </Button>
              <Button
                variant="outline"
                className="rounded-sm"
                onClick={async () => {
                  await signOut();
                  setLocation("/auth");
                }}
              >
                تسجيل الخروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile || profile.status !== "approved") {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isSupplier = profile.role === "supplier";
  const isLogistics = profile.role === "logistics";

  return (
    <DashboardShell profile={profile}>
      {isSupplier || isLogistics ? <SupplierDashboardView /> : <BusinessDashboardView />}

      <Card
        id="dash-profile"
        className="mt-8 rounded-sm border-slate-200 dark:border-slate-800 shadow-sm scroll-mt-20"
      >
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4">
          <CardTitle className="text-base font-bold">الملف الشخصي</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              الاسم
            </div>
            <div className="font-bold text-slate-900 dark:text-white">{profile.full_name}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              المنشأة / الشركة
            </div>
            <div className="font-bold text-slate-900 dark:text-white">{profile.company_name}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              البريد
            </div>
            <div className="font-medium text-slate-600 dark:text-slate-300 break-all">
              {profile.email}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              الدور
            </div>
            <div className="font-bold text-slate-900 dark:text-white">
              {isLogistics ? "جهة نقل" : isSupplier ? "مورّد" : "صاحب منشأة"}
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
