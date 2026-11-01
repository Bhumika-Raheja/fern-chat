import { Router } from "express";
import { signup, login, me, changePassword } from "../controllers/authController.js";
import { googleAuth } from "../controllers/googleAuthController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const router = Router();
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "Too many authentication attempts. Please try again later.",
});

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/google", authLimiter, googleAuth);
router.get("/me", requireAuth, me);
router.patch("/password", requireAuth, changePassword);

export default router;