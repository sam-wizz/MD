import { Router } from "express";
import { db, profilesTable } from "@workspace/db";
import { and, eq, ne, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/partners — role-aware directory:
// business owners see approved suppliers; suppliers see approved businesses.
// Identity always comes from the verified session, never from the client.
router.get("/", requireAuth, async (req, res) => {
  const user_id = req.userId!;
  try {
    const me = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    if (me.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const targetRole = me[0].role === "supplier" ? "business_owner" : "supplier";

    const partners = await db
      .select({
        id: profilesTable.id,
        company_name: profilesTable.company_name,
        full_name: profilesTable.full_name,
        role: profilesTable.role,
        business_type: profilesTable.business_type,
        phone: profilesTable.phone,
        email: profilesTable.email,
        country: profilesTable.country,
        created_at: profilesTable.created_at,
      })
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.role, targetRole),
          eq(profilesTable.status, "approved"),
          ne(profilesTable.user_id, user_id),
        ),
      )
      .orderBy(desc(profilesTable.created_at))
      .limit(100);

    return res.json(
      partners.map((p) => ({ ...p, created_at: p.created_at.toISOString() })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch partners");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
