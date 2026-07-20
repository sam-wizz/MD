import type { Request, Response, NextFunction } from "express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/** قائمة إيميلات الإدارة من متغير البيئة ADMIN_EMAILS (مفصولة بفواصل). */
export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * هل المستخدم من الإدارة؟ المصدر الأساسي عمود is_admin في قاعدة البيانات،
 * مع بقاء ADMIN_EMAILS كقائمة تمهيدية (bootstrap) لأول مدير قبل منح الصلاحيات.
 */
export async function isAdminUser(
  userId?: string,
  email?: string,
): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (!userId) return false;
  try {
    const rows = await db
      .select({ is_admin: profilesTable.is_admin })
      .from(profilesTable)
      .where(eq(profilesTable.user_id, userId))
      .limit(1);
    return rows[0]?.is_admin === true;
  } catch {
    // العمود قد لا يكون موجوداً قبل تشغيل db push — نكتفي حينها بقائمة الإيميلات.
    return false;
  }
}

/** يتطلب أن يكون المستخدم الموثق من الإدارة. يوضع بعد requireAuth. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!(await isAdminUser(req.userId, req.userEmail))) {
    return res.status(403).json({ error: "صلاحية الإدارة مطلوبة" });
  }
  return next();
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Short-TTL cache of verified tokens so each request doesn't cost a round-trip
// to Supabase. TTL is well below Supabase's access-token lifetime (1h default);
// worst case a revoked token stays usable for the TTL window.
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 5_000;
const tokenCache = new Map<string, { id: string; email?: string; expires: number }>();

function getCachedUser(token: string) {
  const entry = tokenCache.get(token);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    tokenCache.delete(token);
    return undefined;
  }
  return entry;
}

function cacheUser(token: string, id: string, email?: string) {
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    // Drop the oldest entries (Map preserves insertion order).
    for (const key of tokenCache.keys()) {
      tokenCache.delete(key);
      if (tokenCache.size < TOKEN_CACHE_MAX) break;
    }
  }
  tokenCache.set(token, { id, email, expires: Date.now() + TOKEN_CACHE_TTL_MS });
}

/**
 * Requires a valid Supabase access token in the Authorization header.
 * Verifies the token against Supabase Auth and attaches the authenticated
 * user's id to req.userId. Never trusts client-supplied user ids.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    req.log.error("Supabase auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)");
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  const cached = getCachedUser(token);
  if (cached) {
    req.userId = cached.id;
    req.userEmail = cached.email;
    return next();
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = (await resp.json()) as { id?: string; email?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    cacheUser(token, user.id, user.email);
    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  } catch (err) {
    req.log.error({ err }, "Failed to verify authentication token");
    return res.status(500).json({ error: "Failed to verify authentication" });
  }
}
