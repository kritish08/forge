import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

export default function AuthCallback() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const sessionId = params.get("session_id");

    if (!sessionId) {
      navigate("/", { replace: true });
      return;
    }

    const processSession = async () => {
      try {
        const res = await api.post("/auth/session", { session_id: sessionId });
        setUser(res.data.user);
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/", { replace: true, state: { user: res.data.user } });
      } catch (err) {
        console.error("Auth callback error:", err);
        navigate("/", { replace: true });
      }
    };

    processSession();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400 font-manrope tracking-widest uppercase">Signing you in...</p>
      </div>
    </div>
  );
}
