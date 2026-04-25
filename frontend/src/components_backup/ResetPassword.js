import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      toast.error("Invalid reset link");
      navigate("/");
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Password reset successful! Please login 🔥");
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      const msg = err.response?.data?.detail || "Password reset failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-200">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-black text-gray-900 font-chivo tracking-tight">FORGE</h1>
          </div>
          <p className="text-orange-600 text-sm font-manrope font-medium tracking-widest uppercase">
            Reset Your Password
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
            <Input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-chivo font-bold text-sm tracking-wide uppercase py-6 rounded-xl transition-all active:scale-95 shadow-lg"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "Reset Password"
            )}
          </Button>
        </form>

        <button
          onClick={() => navigate("/")}
          className="w-full mt-4 text-sm text-gray-600 hover:text-orange-600 font-medium transition-colors"
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}
