import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LogOut, LayoutDashboard, ChevronLeft, ShieldCheck, Sun, Moon, Bell } from "lucide-react";
import {
  useGetMyAccess, getGetMyAccessQueryKey,
  useListNotifications, getListNotificationsQueryKey,
  useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey,
  type Notification,
} from "@workspace/api-client-react";

export function MaddMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round">
        <circle cx="60" cy="60" r="52" />
        <path d="M 60 22 A 38 38 0 1 0 98 60" />
        <path d="M 60 36 A 24 24 0 1 0 84 60" />
        <path d="M 60 50 A 10 10 0 1 0 70 60" />
      </g>
    </svg>
  );
}

async function markNotificationRead(id: number): Promise<Notification> {
  const res = await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("تعذر تحديث الإشعار");
  return res.json() as Promise<Notification>;
}

export function MainNav() {
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: access } = useGetMyAccess({
    query: { enabled: !!user, queryKey: getGetMyAccessQueryKey() },
  });

  const { data: notifications } = useListNotifications({
    query: { enabled: !!user, queryKey: getListNotificationsQueryKey() },
  });

  const { data: unreadData } = useGetUnreadNotificationCount({
    query: { enabled: !!user, queryKey: getGetUnreadNotificationCountQueryKey(), refetchInterval: 30_000 },
  });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
    },
  });

  const handleLogout = async () => {
    await signOut();
    setLocation("/");
  };

  const handleNotificationClick = (n: Notification) => {
    if (n.id && !n.read) markRead.mutate(n.id);
    if (n.order_id) {
      setNotifOpen(false);
      setLocation(`/orders/${n.order_id}`);
    }
  };

  const unreadCount = unreadData?.count ?? 0;

  return (
    <nav className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-50 transition-all duration-500">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 to-transparent pointer-events-none" />
      <div className="container mx-auto px-4 h-20 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-4 group" data-testid="link-home">
          <MaddMark className="h-11 w-11 text-white group-hover:text-zinc-300 transition-colors duration-500" />
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xl tracking-tight text-white group-hover:text-zinc-50 transition-colors duration-300">شركة توريدات مَـد</span>
            <span className="font-display text-[10px] text-zinc-400/80 font-bold tracking-[0.35em] uppercase hidden sm:block mt-0.5">M D — Saudi Arabia</span>
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
              {/* Extension point: email/SMS push notifications via external notifier hook */}
              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="الإشعارات"
                    data-testid="button-notifications"
                    className="relative inline-flex items-center justify-center rounded-sm h-10 w-10 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors duration-300"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-extrabold">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0 rounded-sm" dir="rtl">
                  <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">الإشعارات</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {!notifications?.length ? (
                      <p className="text-xs text-slate-400 text-center py-8 font-bold">لا توجد إشعارات</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-right px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${
                            !n.read ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""
                          }`}
                          data-testid={`notification-${n.id}`}
                        >
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{n.title}</div>
                          {n.body && <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{n.body}</div>}
                          {n.created_at && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.created_at).toLocaleString("ar-SA")}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {access?.is_admin && (
                <Link href="/admin" data-testid="link-admin" className="inline-flex items-center justify-center gap-2 rounded-sm h-10 px-4 text-zinc-300 hover:text-white hover:bg-zinc-600/20 transition-colors duration-300 font-semibold border border-zinc-500/20">
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
              <ChevronLeft className="h-4 w-4 text-zinc-400 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
