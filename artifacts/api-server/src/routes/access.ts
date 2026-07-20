import { Router } from "express";
import { requireAuth, isAdminUser } from "../middlewares/auth";

const router = Router();

// GET /api/me/access — هل المستخدم الحالي من الإدارة؟
router.get("/access", requireAuth, async (req, res) => {
  return res.json({ is_admin: await isAdminUser(req.userId, req.userEmail) });
});

export default router;
