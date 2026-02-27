import { Router } from "express";
import authRoutes from "./auth.js";
import gymRoutes from "./gym.js";
import membersRoutes from "./members.js";
import storageRoutes from "./storage.js";
import apiRoutes from "./api.js";
import statsRoutes from "./stats.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/gym", gymRoutes);
router.use("/members", membersRoutes);
router.use("/storage", storageRoutes);
router.use("/api", apiRoutes);
router.use("/stats", statsRoutes);

export default router;
