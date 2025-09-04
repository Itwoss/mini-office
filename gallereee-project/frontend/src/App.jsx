// src/App.jsx
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Profile from "./pages/Profile.jsx";
import Messages from "./pages/Messages.jsx";
import Sidebar from "./components/Sidebar.jsx";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Register from "./Register"; // adjust path if in pages/Register.jsx

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}



function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 20 }}>Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 20 }}>Loading…</div>;
  return user ? <Navigate to="/home" replace /> : children;
}

export default function App() {
  // 🔧 DEFINE user HERE, before using it below
  const { user } = useAuth();

  return (
    <div className="layout">
      {user ? <Sidebar /> : null}
      <main className="main">
        <div className="noise" />
        <Routes>
          {/* Use `user` only inside App, after the line above */}
          <Route path="/" element={<Navigate to={user ? "/home" : "/login"} replace />} />

          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

          <Route path="/home" element={<Protected><Home /></Protected>} />
          <Route path="/profile/:id" element={<Protected><Profile /></Protected>} />
          <Route path="/messages" element={<Protected><Messages /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
