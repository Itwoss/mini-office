import React from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import AdminOverview from "./Overview.jsx";
import AdminUsers from "./Users.jsx";
import AdminPosts from "./Posts.jsx";
import AdminConversations from "./Conversations.jsx";

export default function AdminLayout() {
  return (
    <section className="section">
      <header className="section-head">
        <h2>Admin</h2>
        <nav style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="" end className="btn">Overview</NavLink>
          <NavLink to="users" className="btn">Users</NavLink>
          <NavLink to="posts" className="btn">Posts</NavLink>
          <NavLink to="conversations" className="btn">Conversations</NavLink>
        </nav>
      </header>

      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="posts" element={<AdminPosts />} />
        <Route path="conversations" element={<AdminConversations />} />
        <Route path="*" element={<Navigate to="." />} />
      </Routes>
    </section>
  );
}
