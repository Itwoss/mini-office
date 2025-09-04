import { Router } from "express";
import Post from "../models/Post.js";
import { verifyToken } from "../utils/auth.js";

const router = Router();

// Create post
router.post("/", verifyToken, async (req, res) => {
  const { title, image } = req.body;
  if (!title || !image) return res.status(400).json({ message: "Missing fields" });
  const post = await Post.create({ user: req.user.id, title, image });
  res.json(post);
});

// Feed (latest)
router.get("/feed", async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 }).limit(60).populate("user", "_id username");
  res.json(posts);
});

// By user
router.get("/user/:userId", async (req, res) => {
  const posts = await Post.find({ user: req.params.userId }).sort({ createdAt: -1 });
  res.json(posts);
});

export default router;
