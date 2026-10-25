import { Router } from "express";
import {
    createConversation,
    listConversations,
} from "../controllers/conversationController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth); // every route below needs a logged-in user

router.get("/", listConversations);
router.post("/", createConversation);

export default router;