import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { searchUsers, getUserProfile, updateProfile } from "../controllers/userController.js";

const router = Router();
router.use(requireAuth);
router.get("/", searchUsers);
router.patch("/me", updateProfile);
router.get("/:id", getUserProfile);
export default router;
