import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import dashboardRouter from "./dashboard";
import partnersRouter from "./partners";
import ordersRouter from "./orders";
import pricesRouter from "./prices";
import invoicesRouter from "./invoices";
import adminRouter from "./admin";
import accessRouter from "./access";
import adminPosRouter from "./admin-pos";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/profiles", profilesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/partners", partnersRouter);
router.use("/orders", ordersRouter);
router.use("/prices", pricesRouter);
router.use("/invoices", invoicesRouter);
router.use("/admin/pos", adminPosRouter);
router.use("/admin", adminRouter);
router.use("/me", accessRouter);

export default router;
