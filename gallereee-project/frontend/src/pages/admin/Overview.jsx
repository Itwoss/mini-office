import React, { useEffect, useState } from "react";
import { AdminAPI } from "../../services/api";

export default function AdminOverview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    AdminAPI.stats().then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="loading">Loading stats…</div>;

  const { counts, series, recent } = data;

  return (
    <div className="admin-grid">
      <div className="stat">
        <div className="stat-value">{counts.users}</div>
        <div className="stat-label">Users</div>
      </div>
      <div className="stat">
        <div className="stat-value">{counts.posts}</div>
        <div className="stat-label">Posts</div>
      </div>
      <div className="stat">
        <div className="stat-value">{counts.conversations}</div>
        <div className="stat-label">Conversations</div>
      </div>
      <div className="stat">
        <div className="stat-value">{counts.messages}</div>
        <div className="stat-label">Messages</div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Recent Users</h3>
        <ul className="list">
          {recent.users.map(u => (
            <li key={u._id}>
              <b>{u.username}</b> <span style={{opacity:.7}}>({u.email})</span>
              {u.isAdmin ? <span className="tag" style={{marginLeft:8}}>Admin</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Recent Posts</h3>
        <ul className="list">
          {recent.posts.map(p => (
            <li key={p._id}><b>{p.title}</b> <span style={{opacity:.7}}>by {p.user?.username}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
