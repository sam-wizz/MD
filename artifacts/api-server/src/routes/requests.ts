import { Router } from "express";
import { db, supplyRequestsTable, requestStatusEnum } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// POST /api/requests — creates a supply request owned by the authenticated caller.
router.post("/", requireAuth, async (req, res) => {
  // requester_id always comes from the verified session, never from the request body.
  const requester_id = req.userId!;
  const {
    requester_name, company_name, business_type,
    product_category, description, quantity, unit, frequency,
    delivery_region, budget_range, notes,
  } = req.body;

  if (!requester_name || !company_name || !business_type ||
      !product_category || !description || !quantity || !unit || !frequency || !delivery_region) {
    return res.status(400).json({ error: "جميع الحقول الأساسية مطلوبة" });
  }

  try {
    const inserted = await db
      .insert(supplyRequestsTable)
      .values({
        requester_id, requester_name, company_name, business_type,
        product_category, description, quantity, unit, frequency,
        delivery_region,
        budget_range: budget_range || null,
        notes: notes || null,
        status: "open",
      })
      .returning();

    return res.status(201).json({
      ...inserted[0],
      created_at: inserted[0].created_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create supply request");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/requests — lists the authenticated caller's own supply requests,
// optionally filtered by ?status=.
router.get("/", requireAuth, async (req, res) => {
  const requester_id = req.userId!;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !requestStatusEnum.enumValues.includes(status as never)) {
    return res.status(400).json({ error: `status must be one of: ${requestStatusEnum.enumValues.join(", ")}` });
  }

  try {
    const rows = await db
      .select()
      .from(supplyRequestsTable)
      .where(
        and(
          eq(supplyRequestsTable.requester_id, requester_id),
          status ? eq(supplyRequestsTable.status, status as typeof requestStatusEnum.enumValues[number]) : undefined,
        ),
      )
      .orderBy(desc(supplyRequestsTable.created_at))
      .limit(200);

    return res.json(
      rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch supply requests");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
