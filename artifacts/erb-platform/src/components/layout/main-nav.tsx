import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, LayoutDashboard, ChevronLeft, ShieldCheck, Sun, Moon } from "lucide-react";
import { useGetMyAccess, getGetMyAccessQueryKey } from "@workspace/api-client-react";

export function MainNav() {
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const { data: access } = useGetMyAccess({
    query: { enabled: !!user, queryKey: getGetMyAccessQueryKey() },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  return (
    <nav className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-50 transition-all duration-500">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 to-transparent pointer-events-none" />
      <div className="container mx-auto px-4 h-20 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-4 group" data-testid="link-home">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-2.5 rounded-sm shadow-lg shadow-blue-900/20 group-hover:shadow-blue-900/40 transition-all duration-500 border border-blue-500/20">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xl tracking-tight text-white group-hover:text-blue-50 transition-colors duration-300">شركة توريدات مَـد</span>
            <span className="font-display text-[10px] text-blue-400/80 font-bold tracking-[0.25em] uppercase hidden sm:block mt-0.5">Saudi Arabia</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={resolvedTheme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
            data-testid="button-theme-toggle"
            className="inline-flex items-center justify-center rounded-sm h-10 w-10 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors duration-300"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {user ? (
            <>
              {access?.is_admin && (
                <Link href="/admin" data-testid="link-admin" className="inline-flex items-center justify-center gap-2 rounded-sm h-10 px-4 text-blue-300 hover:text-white hover:bg-blue-600/20 transition-colors duration-300 font-semibold border border-blue-500/20">
                  <ShieldCheck className="h-4 w-4" />
                  <span>الإدارة</span>
                </Link>
              )}
              <Link href="/dashboard" data-testid="link-dashboard" className="inline-flex items-center justify-center gap-2 rounded-sm h-10 px-4 text-slate-300 hover:text-white hover:bg-white/10 transition-colors duration-300 font-semibold">
                <LayoutDashboard className="h-4 w-4" />
                <span>لوحة التحكم</span>
              </Link>
              <Button variant="outline" onClick={handleLogout} className="gap-2 rounded-sm border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white transition-all duration-300" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
                <span className="font-semibold hidden sm:inline-block">تسجيل الخروج</span>
              </Button>
            </>
          ) : (
            <Link href="/auth" data-testid="link-login" className="inline-flex items-center justify-center rounded-sm font-bold border border-white/15 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md gap-2 h-10 px-6 transition-all duration-300 group">
              تسجيل الدخول
              <ChevronLeft className="h-4 w-4 text-blue-400 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
