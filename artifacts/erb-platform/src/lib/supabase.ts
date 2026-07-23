import { createClient } from "@supabase/supabase-js";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.error(
    "[مَد] Supabase غير مضبوط: عيّن VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (أو SUPABASE_ANON_KEY وقت البناء). لن يعمل تسجيل الدخول.",
  );
}

/** عميل المصادقة — حتى مع إعداد ناقص ننشئ عميلاً حتى لا تنهار الواجهة */
export const supabase = createClient(
  SUPABASE_URL || "https://example.supabase.co",
  SUPABASE_ANON_KEY || "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

// إرفاق توكن الجلسة بكل طلبات API
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});
