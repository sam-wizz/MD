import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Tags,
  LogOut,
  UserRound,
  Menu,
  ChevronDown,
  FileSearch,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { MaddMark } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@workspace/api-client-react";

export type DashNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match?: (path: string) => boolean;
};

function defaultNav(role: UserProfile["role"]): DashNavItem[] {
  if (role === "supplier") {
    return [
      {
        href: "/dashboard",
        label: "نظرة عامة",
        icon: LayoutDashboard,
        match: (p) => p === "/dashboard" || p.startsWith("/dashboard?"),
      },
      {
        href: "/dashboard#assigned",
        label: "الطلبات المسندة",
        icon: Package,
      },
      {
        href: "/dashboard#prices",
        label: "قائمة الأسعار",
        icon: Tags,
      },
    ];
  }
  return [
    {
      href: "/dashboard",
      label: "نظرة عامة",
      icon: LayoutDashboard,
      match: (p) => p === "/dashboard" || p.startsWith("/dashboard?"),
    },
    {
      href: "/dashboard#orders",
      label: "طلباتي",
      icon: Package,
    },
    {
      href: "/orders/new",
      label: "طلب جديد",
      icon: PackagePlus,
    },
    {
      href: "/dashboard#invoices",
      label: "تحليل الفواتير",
      icon: FileSearch,
    },
  ];
}

function NavLinks({
  items,
  location,
  onNavigate,
  variant,
}: {
  items: DashNavItem[];
  location: string;
  onNavigate?: () => void;
  variant: "side" | "bottom" | "sheet";
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const pathOnly = location.split("#")[0] || "/";
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const active = item.match
          ? item.match(pathOnly)
          : item.href.includes("#")
            ? hash === `#${item.href.split("#")[1]}` ||
              (item.href.endsWith("#orders") && !hash && pathOnly === "/dashboard")
            : pathOnly === item.href;

        if (variant === "bottom") {
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold transition-colors",
                active ? "text-zinc-900 dark:text-white" : "text-slate-400 hover:text-slate-700",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-bold transition-colors",
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
              variant === "sheet" && "text-base py-3",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function DashboardShell({
  profile,
  children,
  navItems,
}: {
  profile: UserProfile;
  children: ReactNode;
  navItems?: DashNavItem[];
}) {
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const items = useMemo(
    () => navItems ?? defaultNav(profile.role),
    [navItems, profile.role],
  );

  const handleSignOut = async () => {
    await signOut();
    setLocation("/");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="h-14 px-3 md:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="فتح القائمة"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0" dir="rtl">
                <SheetHeader className="p-4 border-b text-right">
                  <SheetTitle className="flex items-center gap-2 justify-start">
                    <MaddMark className="h-7 w-7" />
                    مَـد
                  </SheetTitle>
                </SheetHeader>
                <nav className="p-3 space-y-1">
                  <NavLinks
                    items={items}
                    location={location}
                    variant="sheet"
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
              </SheetContent>
            </Sheet>

            <Link href="/dashboard" className="flex items-center gap-2 min-w-0 group">
              <MaddMark className="h-8 w-8 text-zinc-900 dark:text-white shrink-0" />
              <div className="min-w-0 hidden sm:block">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  شركة توريدات مَـد
                </div>
                <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                  MD Platform
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex text-xs font-bold text-slate-500"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            >
              {collapsed ? "إظهار القائمة" : "طي القائمة"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-sm h-10 gap-2 max-w-[220px] border-slate-200 dark:border-slate-700"
                  aria-label="قائمة المستخدم"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 text-right hidden xs:block sm:block">
                    <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate max-w-[140px]">
                      {profile.full_name}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate max-w-[140px]">
                      {profile.company_name}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-right">
                  <div className="font-extrabold">{profile.full_name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{profile.company_name}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer justify-start gap-2"
                  onClick={() => {
                    document.getElementById("dash-profile")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <UserRound className="h-4 w-4" />
                  الملف الشخصي
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer justify-start gap-2 text-red-600 focus:text-red-600"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* الشريط الجانبي — سطح المكتب */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 transition-[width] duration-200",
            collapsed ? "w-[68px]" : "w-56",
          )}
        >
          <nav className="p-2 space-y-1 sticky top-14">
            {items.map((item) => {
              const Icon = item.icon;
              const pathOnly = location.split("#")[0] || "/";
              const active = item.match
                ? item.match(pathOnly)
                : pathOnly === item.href.split("#")[0];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                    collapsed && "justify-center px-2",
                  )}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* المحتوى */}
        <main className="flex-1 min-w-0 px-3 md:px-6 py-5 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* شريط سفلي للجوال */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur flex"
        aria-label="التنقل السفلي"
      >
        <NavLinks items={items.slice(0, 4)} location={location} variant="bottom" />
      </nav>
    </div>
  );
}
