import { Router } from "express";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const router = Router();

export default router;


// Helpers
const toInt = (v, d) => Number.isFinite(+v) ? Math.max(0, parseInt(v,10)) : d;

/**
 * GET /api/admin/stats
 * Overall counts + last 14 days timeseries + recent items
 */
router.get("/stats", async (_req, res) => {
  const [users, posts, convos, messages] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Conversation.countDocuments(),
    Message.countDocuments(),
  ]);

  // last 14 days activity (users & posts)
  const since = new Date(); since.setDate(since.getDate() - 13); // include today
  const dayFmt = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };

  const [usersSeries, postsSeries] = await Promise.all([
    User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayFmt, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Post.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: dayFmt, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);

  const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select("_id username email isAdmin createdAt");
  const recentPosts = await Post.find().sort({ createdAt: -1 }).limit(5).populate("user","_id username").select("_id title image createdAt user");

  res.json({
    counts: { users, posts, conversations: convos, messages },
    series: { users: usersSeries, posts: postsSeries },
    recent: { users: recentUsers, posts: recentPosts },
  });
});

/**
 * GET /api/admin/users?query=&page=1&limit=20
 */
router.get("/users", async (req, res) => {
  const page  = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const q = (req.query.query || "").trim();
  const cond = q ? { $or: [{ username: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }] } : {};
  const [items, total] = await Promise.all([
    User.find(cond).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).select("_id username email isAdmin createdAt"),
    User.countDocuments(cond),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total/limit) });
});

/**
 * PATCH /api/admin/users/:id/role { isAdmin: true|false }
 */
router.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { isAdmin } = req.body;
  const u = await User.findByIdAndUpdate(id, { isAdmin: !!isAdmin }, { new: true }).select("_id username email isAdmin");
  res.json(u);
});

/**
 * DELETE /api/admin/users/:id
 * (also removes user's posts & messages)
 */
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  await Promise.all([
    Post.deleteMany({ user: id }),
    Message.deleteMany({ sender: id }),
  ]);
  await User.findByIdAndDelete(id);
  res.json({ ok: true });
});

/**
 * GET /api/admin/posts?query=&page=&limit=
 */
router.get("/posts", async (req, res) => {
  const page  = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const q = (req.query.query || "").trim();
  const cond = q ? { title: { $regex: q, $options: "i" } } : {};
  const [items, total] = await Promise.all([
    Post.find(cond).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).populate("user","_id username").select("_id title image user createdAt"),
    Post.countDocuments(cond),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total/limit) });
});

/**
 * DELETE /api/admin/posts/:id
 */
router.delete("/posts/:id", async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/**
 * GET /api/admin/conversations?page=&limit=
 */
router.get("/conversations", async (req, res) => {
  const page  = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const [items, total] = await Promise.all([
    Conversation.find().sort({ lastMessageAt: -1 }).skip((page-1)*limit).limit(limit).populate("participants","_id username").select("_id participants lastMessageAt createdAt"),
    Conversation.countDocuments(),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total/limit) });
});

/**
 * DELETE /api/admin/conversations/:id
 */
router.delete("/conversations/:id", async (req, res) => {
  const id = req.params.id;
  await Message.deleteMany({ conversation: id });
  await Conversation.findByIdAndDelete(id);
  res.json({ ok: true });
});


// backend/src/routes/admin.js
// The following block was removed to avoid duplicate default exports and router definitions.

