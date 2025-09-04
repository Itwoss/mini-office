// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { Server } from "socket.io";

// routes
import authRoutes from "./src/routes/auth.js";
import adminRoutes from "./src/routes/admin.js";

// auth helpers
import { verifyToken, requireAdmin } from "./src/utils/auth.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
});

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// health
app.get("/", (_req, res) => res.json({ ok: true, name: "Mini Office API" }));

// api routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", verifyToken, requireAdmin, adminRoutes);

// optional sockets
io.on("connection", (socket) => {
  // console.log("socket connected:", socket.id);
  socket.on("disconnect", () => {
    // console.log("socket disconnected:", socket.id);
  });
});

const start = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    const port = process.env.PORT || 5000;
    server.listen(port, () =>
      console.log(`API listening on http://localhost:${port}`)
    );
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
};
start();
