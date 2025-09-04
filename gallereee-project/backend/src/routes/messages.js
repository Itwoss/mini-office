import { Router } from "express";
import { verifyToken } from "../utils/auth.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const router = Router();

// List conversations for current user
router.get("/conversations", verifyToken, async (req, res) => {
  const convos = await Conversation.find({ participants: req.user.id })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "_id username");
  res.json(convos);
});

// Get messages for a conversation
router.get("/:conversationId", verifyToken, async (req, res) => {
  const msgs = await Message.find({ conversation: req.params.conversationId })
    .sort({ createdAt: 1 })
    .populate("sender", "_id username");
  res.json(msgs);
});

// Start a conversation (or get existing)
router.post("/start", verifyToken, async (req, res) => {
  const { toUserId } = req.body;
  let convo = await Conversation.findOne({ participants: { $all: [req.user.id, toUserId] } });
  if (!convo) convo = await Conversation.create({ participants: [req.user.id, toUserId] });
  res.json(convo);
});

export default router;
