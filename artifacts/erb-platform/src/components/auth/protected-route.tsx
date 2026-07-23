import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

/**
 * يحمي المسارات التي تتطلب جلسة.
 * يحفظ الوجهة في ?redirect= ويعود إليها بعد تسجيل الدخول.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const redirect = encodeURIComponent(location || "/dashboard");
      setLocation(`/auth?redirect=${redirect}`);
    }
  }, [user, loading, location, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
        <Spinner className="h-6 w-6 text-slate-400" aria-label="جارٍ التحميل" />
        <p className="text-sm font-bold text-slate-400">جارٍ التحقق من الجلسة...</p>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
