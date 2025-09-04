import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PostAPI } from "../services/api";
import PostCard from "../components/PostCard";

export default function Profile() {
  const { id } = useParams();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    PostAPI.byUser(id).then(({data}) => setPosts(data));
  }, [id]);

  return (
    <section className="section">
      <header className="section-head"><h2>Profile</h2></header>
      <div className="grid">{posts.map(p => <PostCard key={p._id} post={p} />)}</div>
    </section>
  );
}
