import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("fc_token");
    if (!token) {
      setUser(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("fc_token");
        setUser(false);
      });
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("fc_token", res.data.token);
    setUser(res.data.user);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {}
    localStorage.removeItem("fc_token");
    setUser(false);
  };

  const refreshUser = async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (e) {}
  };

  const hasPerm = (perm) =>
    !!user && (user.role === "admin" || (user.permissions || []).includes(perm));

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPerm, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
