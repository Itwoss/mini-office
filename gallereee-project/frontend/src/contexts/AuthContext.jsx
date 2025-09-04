// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthAPI } from "../services/api";

const Ctx = createContext(null);
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // load current user if token exists
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) { setReady(true); return; }
    AuthAPI.me()
      .then(res => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (identifier, password) => {
    try {
      const { data } = await AuthAPI.login({ identifier, password });
      localStorage.setItem("token", data.token);
      setUser(data.user);
    } catch (err) {
      const msg = err?.response?.data?.message || "Login failed";
      throw new Error(msg);
    }
  };

  // frontend/src/contexts/AuthContext.jsx
const register = async (username, email, password) => {
  try {
    const { data } = await AuthAPI.register({ username, email, password });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  } catch (err) {
    const msg = err?.response?.data?.message || "Register failed";
    throw new Error(msg);
  }
};

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
