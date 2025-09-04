import React, { useEffect, useState } from "react";
import { PostAPI } from "../services/api";
import PostCard from "../components/PostCard";

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState({ title: "", image: "" });

  const load = async () => {
    const { data } = await PostAPI.feed();
    setPosts(data);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title || !form.image) return;
    await PostAPI.create(form);
    setForm({ title: "", image: "" });
    load();
  };

  return (
    <section className="section">
      <header className="section-head"><h2>Latest</h2></header>

      {/* quick create like Instagram add */}
      <form className="composer" onSubmit={create}>
        <input placeholder="Title…" value={form.title} onChange={e=>setForm(f=>({...f, title: e.target.value}))} />
        <input placeholder="Image URL…" value={form.image} onChange={e=>setForm(f=>({...f, image: e.target.value}))} />
        <button className="btn primary">Post</button>
      </form>

      <div className="grid">
        {posts.map(p => <PostCard key={p._id} post={p} />)}
      </div>
    </section>
  );
}
