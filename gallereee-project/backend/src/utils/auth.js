// backend/src/utils/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

export const verifyToken = (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const verifySocketToken = (token) => {
  if (!token) throw new Error("No token");
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return { id: payload.id };
};

export const requireAdmin = async (req, res, next) => {
  const me = await User.findById(req.user.id).select("isAdmin");
  if (!me?.isAdmin) return res.status(403).json({ message: "Admin only" });
  next();
};
