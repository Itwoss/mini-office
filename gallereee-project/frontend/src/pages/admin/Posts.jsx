import React, { useEffect, useState } from "react";
import { AdminAPI } from "../../services/api";

export default function AdminPosts() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async (p = 1) => {
    const { data } = await AdminAPI.posts({ query: q, page: p, limit });
    setRows(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
  };

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  const remove = async (p) => {
    if (!confirm(`Delete post "${p.title}"?`)) return;
    await AdminAPI.deletePost(p._id);
    load(page);
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="input" placeholder="Search post title…" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="btn" onClick={()=>load(1)}>Search</button>
      </div>

      <div className="table">
        <div className="thead"><div>Title</div><div>Author</div><div>Created</div><div>Actions</div></div>
        {rows.map(p => (
          <div className="trow" key={p._id}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
            <div>{p.user?.username}</div>
            <div>{new Date(p.createdAt).toLocaleString()}</div>
            <div><button className="btn secondary" onClick={()=>remove(p)}>Delete</button></div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={page<=1} onClick={()=>load(page-1)}>Prev</button>
        <div className="tag">Page {page}/{Math.ceil(total/limit)||1}</div>
        <button className="btn" disabled={page>=Math.ceil(total/limit)} onClick={()=>load(page+1)}>Next</button>
      </div>
    </div>
  );
}
