import React from "react";

export default function PostCard({ post }) {
  return (
    <article className="card">
      <div className="frame">
        <img src={post.image} alt={post.title} loading="lazy" />
        <div className="frame-border" />
      </div>
      <h3 className="title">{post.title}</h3>
    </article>
  );
}
