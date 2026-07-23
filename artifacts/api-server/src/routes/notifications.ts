import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, req.userId!))
      .orderBy(desc(notificationsTable.created_at))
      .limit(50);
    return res.json(
      rows.map((n) => ({
        ...n,
        created_at: n.created_at.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(eq(notificationsTable.user_id, req.userId!), eq(notificationsTable.read, false)),
      );
    return res.json({ count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to count notifications");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** يجب أن يسبق /:id/read حتى لا يُفسَّر «read-all» كمعرّف */
router.post("/read-all", async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(eq(notificationsTable.user_id, req.userId!), eq(notificationsTable.read, false)),
      );
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/read", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  try {
    const updated = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(eq(notificationsTable.id, id), eq(notificationsTable.user_id, req.userId!)),
      )
      .returning();
    if (!updated[0]) return res.status(404).json({ error: "الإشعار غير موجود" });
    return res.json({ ...updated[0], created_at: updated[0].created_at.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
