import { Router } from "express";
import {
    createConversation,
    listConversations,
    markRead,
} from "../controllers/conversationController.js";
import { sendMessage, getMessages } from "../controllers/messageController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get("/", listConversations);
router.post("/", createConversation);

router.get("/:id/messages", getMessages);
router.post("/:id/messages", sendMessage);
router.post("/:id/read", markRead);

export default router;