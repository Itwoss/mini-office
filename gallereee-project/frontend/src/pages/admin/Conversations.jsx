import React, { useEffect, useState } from "react";
import { AdminAPI } from "../../services/api";

export default function AdminConversations() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async (p = 1) => {
    const { data } = await AdminAPI.conversations({ page: p, limit });
    setRows(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
  };

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  const remove = async (c) => {
    if (!confirm(`Delete conversation ${c._id}?`)) return;
    await AdminAPI.deleteConversation(c._id);
    load(page);
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="panel">
      <div className="table">
        <div className="thead"><div>ID</div><div>Participants</div><div>Last Message</div><div>Actions</div></div>
        {rows.map(c => (
          <div className="trow" key={c._id}>
            <div style={{ fontFamily: "monospace" }}>{c._id.slice(-8)}</div>
            <div>{c.participants.map(p => p.username).join(", ")}</div>
            <div>{new Date(c.lastMessageAt).toLocaleString()}</div>
            <div><button className="btn secondary" onClick={()=>remove(c)}>Delete</button></div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={page<=1} onClick={()=>load(page-1)}>Prev</button>
        <div className="tag">Page {page}/{pages||1}</div>
        <button className="btn" disabled={page>=pages} onClick={()=>load(page+1)}>Next</button>
      </div>
    </div>
  );
}
