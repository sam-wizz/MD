import type { Request, Response, NextFunction } from "express";

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

/** يتطلب أن يكون المستخدم الموثق ضمن إيميلات الإدارة. يوضع بعد requireAuth. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!isAdminEmail(req.userEmail)) {
    return res.status(403).json({ error: "صلاحية الإدارة مطلوبة" });
  }
  return next();
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

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

    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  } catch (err) {
    req.log.error({ err }, "Failed to verify authentication token");
    return res.status(500).json({ error: "Failed to verify authentication" });
  }
}
