import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  browseChannels,
  previewMessages,
  joinChannelHandler,
} from "../controllers/channelController.js";

const router = Router();

router.use(requireAuth);

router.get("/", browseChannels);
router.get("/:id/messages", previewMessages);
router.post("/:id/join", joinChannelHandler);

export default router;