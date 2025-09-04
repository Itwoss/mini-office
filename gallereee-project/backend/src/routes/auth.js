// backend/src/routes/auth.js
import express from "express";
import User from "../models/User.js";
import { signToken } from "../utils/auth.js";

const router = express.Router();

/** Register */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, username } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already in use" });

    const user = await User.create({ name, email, password, username });
    const token = signToken(user);
    res.status(201).json({
      message: "Registered",
      user: { id: user._id, name: user.name, email: user.email, username: user.username },
      token,
    });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

/** Login */
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email (or username if you add it)
    if (!identifier || !password) return res.status(400).json({ message: "Missing fields" });

    const user = await User.findOne({ email: identifier }); // expand later to include username
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(user);
    res.json({
      message: "Logged in",
      user: { id: user._id, name: user.name, email: user.email, username: user.username },
      token,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
