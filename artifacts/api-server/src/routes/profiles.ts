import { Router } from "express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/profiles/me — returns the authenticated caller's own profile.
router.get("/me", requireAuth, async (req, res) => {
  const user_id = req.userId!;
  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    if (profiles.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    return res.json({
      ...profiles[0],
      created_at: profiles[0].created_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/profiles — creates/updates the authenticated caller's own profile.
router.post("/", requireAuth, async (req, res) => {
  // user_id always comes from the verified session, never from the request body.
  const user_id = req.userId!;
  const { email, full_name, company_name, role, business_type, phone, industry, country } = req.body;

  if (!email || !full_name || !company_name || !role) {
    return res.status(400).json({ error: "Missing required fields: email, full_name, company_name, role" });
  }
  if (!["supplier", "business_owner"].includes(role)) {
    return res.status(400).json({ error: "role must be 'supplier' or 'business_owner'" });
  }

  try {
    const existing = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    const isUpdate = existing.length > 0;
    let profile;
    if (isUpdate) {
      const updated = await db
        .update(profilesTable)
        .set({ email, full_name, company_name, role, business_type: business_type || null, phone, industry, country, updated_at: new Date() })
        .where(eq(profilesTable.user_id, user_id))
        .returning();
      profile = updated[0];
    } else {
      const inserted = await db
        .insert(profilesTable)
        .values({ user_id, email, full_name, company_name, role, business_type: business_type || null, phone, industry, country, status: "pending" })
        .returning();
      profile = inserted[0];
    }

    return res.status(isUpdate ? 200 : 201).json({
      ...profile,
      created_at: profile.created_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
