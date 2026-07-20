import { Router } from "express";
import { requireAuth, isAdminEmail } from "../middlewares/auth";

const router = Router();

// GET /api/me/access — هل المستخدم الحالي من الإدارة؟
router.get("/access", requireAuth, (req, res) => {
  return res.json({ is_admin: isAdminEmail(req.userEmail) });
});

export default router;
