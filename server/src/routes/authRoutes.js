import { Router } from "express";
import { signup, login, me } from "../controllers/authController.js";
import { googleAuth } from "../controllers/googleAuthController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);
router.get("/me", requireAuth, me);

export default router;