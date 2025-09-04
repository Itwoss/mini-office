import React from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand"><Link to="/">Gallereee</Link></div>

      <nav className="side-nav">
        <NavLink to="/home" className="nav-item"><span className="icon">🏠</span><span>Home</span></NavLink>
        <NavLink to="/messages" className="nav-item"><span className="icon">💬</span><span>Messages</span></NavLink>
        {user ? (
          <NavLink to={`/profile/${user._id}`} className="nav-item"><span className="icon">👤</span><span>Profile</span></NavLink>
        ) : null}
      </nav>

      <div className="cats-label">Categories</div>
      <ul className="cats">
        <li><a><span className="dot" />Websites</a></li>
        <li><a><span className="dot" />Templates</a></li>
        <li><a><span className="dot" />Resources</a></li>
        <li><a><span className="dot" />Plugins</a></li>
        <li><a><span className="dot" />Courses</a></li>
      </ul>

      <div style={{ marginTop: "auto", padding: "12px 8px" }}>
        {user ? (
          <button className="btn" onClick={logout}>Logout</button>
        ) : (
          <>
            <NavLink to="/login" className="btn" style={{ marginRight: 8 }}>Login</NavLink>
            <NavLink to="/register" className="btn secondary">Register</NavLink>
          </>
        )}
      </div>

      <div className="sidebar-fade" />
    </aside>
  );
}
