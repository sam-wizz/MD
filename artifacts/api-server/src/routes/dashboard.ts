import { Router } from "express";
import { db, profilesTable, ordersTable, type Order } from "@workspace/db";
import { eq, count, countDistinct, desc, inArray, isNotNull, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const ACTIVE_ORDER_STATUSES = ["assigned", "preparing", "in_transit"] as const;

// GET /api/dashboard/overview — returns the authenticated caller's own overview.
router.get("/overview", requireAuth, async (req, res) => {
  // user_id always comes from the verified session, never from the client.
  const user_id = req.userId!;
  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, user_id))
      .limit(1);

    const profile = profiles[0];

    const suppliersResult = await db
      .select({ count: count() })
      .from(profilesTable)
      .where(eq(profilesTable.role, "supplier"));

    const retailersResult = await db
      .select({ count: count() })
      .from(profilesTable)
      .where(eq(profilesTable.role, "business_owner"));

    const activeConnectionsResult = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(inArray(ordersTable.status, [...ACTIVE_ORDER_STATUSES]));

    return res.json({
      role: profile?.role ?? "business_owner",
      status: profile?.status ?? "pending",
      company_name: profile?.company_name ?? "",
      full_name: profile?.full_name ?? "",
      registered_at: profile?.created_at?.toISOString() ?? new Date().toISOString(),
      total_suppliers: Number(suppliersResult[0]?.count ?? 0),
      total_retailers: Number(retailersResult[0]?.count ?? 0),
      active_connections: Number(activeConnectionsResult[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch dashboard overview");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function orderActivity(order: Order, viewerId: string) {
  const category = order.product_category;
  const byStatus: Record<Order["status"], { type: string; message: string }> = {
    pending: { type: "connection", message: `طلب توريد جديد (${category}) — ${order.delivery_region}` },
    approved: { type: "approval", message: `تمت الموافقة على طلب ${category} وبانتظار إسناده لمورد` },
    assigned: { type: "connection", message: `تم إسناد طلب ${category} إلى ${order.assigned_supplier_company ?? "مورد"}` },
    preparing: { type: "update", message: `جاري تجهيز طلب ${category}` },
    in_transit: { type: "update", message: `طلب ${category} في الطريق إلى ${order.delivery_region}` },
    delivered: { type: "milestone", message: `تم تسليم طلب ${category} بنجاح` },
    rejected: { type: "update", message: `تم رفض طلب ${category}` },
    cancelled: { type: "update", message: `تم إلغاء طلب ${category}` },
  };
  const { type, message } = byStatus[order.status];
  return {
    id: order.id,
    type,
    message,
    timestamp: order.updated_at.toISOString(),
    role: order.business_id === viewerId ? "business_owner" : "supplier",
  };
}

// GET /api/dashboard/activity — the caller's own recent order activity.
router.get("/activity", requireAuth, async (req, res) => {
  const user_id = req.userId!;
  try {
    const recentOrders = await db
      .select()
      .from(ordersTable)
      .where(
        or(
          eq(ordersTable.business_id, user_id),
          eq(ordersTable.assigned_supplier_id, user_id),
        ),
      )
      .orderBy(desc(ordersTable.updated_at))
      .limit(10);

    return res.json(recentOrders.map((order) => orderActivity(order, user_id)));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch dashboard activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const suppliersResult = await db
      .select({ count: count() })
      .from(profilesTable)
      .where(eq(profilesTable.role, "supplier"));

    const retailersResult = await db
      .select({ count: count() })
      .from(profilesTable)
      .where(eq(profilesTable.role, "business_owner"));

    const pendingResult = await db
      .select({ count: count() })
      .from(profilesTable)
      .where(eq(profilesTable.status, "pending"));

    const activeConnectionsResult = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(inArray(ordersTable.status, [...ACTIVE_ORDER_STATUSES]));

    // Distinct delivery regions with at least one order.
    const regionsResult = await db
      .select({ count: countDistinct(ordersTable.delivery_region) })
      .from(ordersTable);

    // Distinct business types among registered owners (restaurant, cafe, ...).
    const industriesResult = await db
      .select({ count: countDistinct(profilesTable.business_type) })
      .from(profilesTable)
      .where(isNotNull(profilesTable.business_type));

    return res.json({
      total_suppliers: Number(suppliersResult[0]?.count ?? 0),
      total_retailers: Number(retailersResult[0]?.count ?? 0),
      pending_approvals: Number(pendingResult[0]?.count ?? 0),
      active_connections: Number(activeConnectionsResult[0]?.count ?? 0),
      countries_served: Number(regionsResult[0]?.count ?? 0),
      industries_covered: Number(industriesResult[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch platform stats");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
