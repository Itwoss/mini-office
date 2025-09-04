// frontend/src/services/api.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true, // ok to keep; not required for Bearer tokens
});

// 🔐 attach token if present
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export const AuthAPI = {
  login:    (body) => api.post("/auth/login", body),
  register: (body) => api.post("/auth/register", body),
  me:       ()     => api.get("/auth/me"),
};

export const PostAPI = {
  feed:   () => api.get("/posts/feed"),
  byUser: (userId) => api.get(`/posts/user/${userId}`),
  create: (data) => api.post("/posts", data),
};

export const MsgAPI = {
  conversations:   () => api.get("/messages/conversations"),
  getMessages:     (id) => api.get(`/messages/${id}`),
  start:           (toUserId) => api.post("/messages/start", { toUserId }),
};

export const AdminAPI = {
  stats:               () => api.get("/admin/stats"),
  users:               (params) => api.get("/admin/users", { params }),
  setUserRole:         (id, isAdmin) => api.patch(`/admin/users/${id}/role`, { isAdmin }),
  deleteUser:          (id) => api.delete(`/admin/users/${id}`),
  posts:               (params) => api.get("/admin/posts", { params }),
  deletePost:          (id) => api.delete(`/admin/posts/${id}`),
  conversations:       (params) => api.get("/admin/conversations", { params }),
  deleteConversation:  (id) => api.delete(`/admin/conversations/${id}`),
};

export default api;
