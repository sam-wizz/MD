import type { UserProfile } from "@workspace/api-client-react";

/** وجهة ما بعد تسجيل الدخول حسب الحالة والدور */
export function destinationForProfile(profile: UserProfile): string {
  if (profile.status === "pending") return "/auth?mode=pending";
  if (profile.status === "rejected") return "/auth?mode=rejected";
  if (profile.is_admin) return "/admin";
  // لوحتا المورد وصاحب المنشأة على نفس المسار مع عرض مختلف داخلياً
  return "/dashboard";
}

export function readRedirectParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const redirect = params.get("redirect") || params.get("next");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) return null;
  // لا نُعيد إلى شاشة المصادقة نفسها
  if (redirect.startsWith("/auth")) return null;
  return redirect;
}

export function authModeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("mode");
}
