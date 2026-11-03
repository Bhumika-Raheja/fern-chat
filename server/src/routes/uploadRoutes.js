import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { uploadFile } from "../controllers/uploadController.js";

const router = Router();

router.post("/", requireAuth, upload.single("file"), uploadFile);

export default router;