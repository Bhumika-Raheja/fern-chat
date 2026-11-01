import { Router } from "express";
import {
    createConversation,
    listConversations,
    getConversation,
    updateConversation,
} from "../controllers/conversationController.js";
import { sendMessage, getMessages, searchMessages } from "../controllers/messageController.js";
import { requireAuth } from "../middleware/auth.js";
import { getReceipts, markRead } from "../controllers/receiptController.js";
import { getReactions } from "../controllers/reactionController.js";
import { addMembers, removeMember, changeMemberRole, leaveConversation } from "../controllers/membershipController.js";

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get("/", listConversations);
router.post("/", createConversation);
router.get("/:id", getConversation);
router.patch("/:id", updateConversation);

router.post("/:id/members", addMembers);
router.delete("/:id/members/:userId", removeMember);
router.patch("/:id/members/:userId/role", changeMemberRole);
router.post("/:id/leave", leaveConversation);

router.get("/:id/messages", getMessages);
router.get("/:id/messages/search", searchMessages);
router.get("/:id/messages/reactions", getReactions);
router.post("/:id/messages", sendMessage);
router.post("/:id/read", markRead);
router.get("/:id/receipts", getReceipts);

export default router;