import React, { useEffect, useState } from "react";
import { AdminAPI } from "../../services/api";

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async (p = 1) => {
    const { data } = await AdminAPI.users({ query: q, page: p, limit });
    setRows(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
  };

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  const toggleAdmin = async (u) => {
    const upd = await AdminAPI.setUserRole(u._id, !u.isAdmin);
    setRows(rows.map(r => r._id === u._id ? { ...r, isAdmin: upd.data.isAdmin } : r));
  };

  const remove = async (u) => {
    if (!confirm(`Delete user ${u.username}?`)) return;
    await AdminAPI.deleteUser(u._id);
    load(page);
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="input" placeholder="Search username or email…" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="btn" onClick={()=>load(1)}>Search</button>
      </div>

      <div className="table">
        <div className="thead">
          <div>Username</div><div>Email</div><div>Role</div><div>Actions</div>
        </div>
        {rows.map(u => (
          <div className="trow" key={u._id}>
            <div>{u.username}</div>
            <div>{u.email}</div>
            <div>{u.isAdmin ? "Admin" : "User"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={()=>toggleAdmin(u)}>{u.isAdmin ? "Revoke Admin" : "Make Admin"}</button>
              <button className="btn secondary" onClick={()=>remove(u)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={page<=1} onClick={()=>load(page-1)}>Prev</button>
        <div className="tag">Page {page}/{pages || 1}</div>
        <button className="btn" disabled={page>=pages} onClick={()=>load(page+1)}>Next</button>
      </div>
    </div>
  );
}
