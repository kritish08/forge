import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = import.meta.env.VITE_BACKEND_URL + "/api";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        // Try to refresh using httpOnly cookie
        const res = await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        localStorage.setItem("access_token", res.data.access_token);
        setUser(res.data.user);
      } else {
        // Verify token with /auth/me
        const res = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        setUser(res.data);
      }
    } catch {
      // Both token and refresh failed
      localStorage.removeItem("access_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch {
      /* the local session is cleared below regardless */
    }
    localStorage.removeItem("access_token");
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setUser(res.data);
    } catch {
      /* keep the current user; the next request will surface a real 401 */
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
