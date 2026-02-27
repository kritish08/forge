import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import api from "../utils/api";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export default function Login() {
  const { setUser } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isForgotPassword) {
        // Password reset request
        await api.post("/auth/forgot-password", { email: formData.email.trim() });
        toast.success("Password reset link sent! Check your email 📧");
        setIsForgotPassword(false);
        setFormData({ email: "", password: "", name: "" });
      } else {
        // Login or Register
        const endpoint = isRegistering ? "/auth/register" : "/auth/login";
        const payload = isRegistering
          ? { email: formData.email.trim(), password: formData.password, name: formData.name.trim() }
          : { email: formData.email.trim(), password: formData.password };

        const res = await api.post(endpoint, payload);
        
        // Store access token
        localStorage.setItem("access_token", res.data.access_token);
        
        // Set user in context
        setUser(res.data.user);
        
        toast.success(isRegistering ? "Welcome to FORGE! 🔥" : "Welcome back! 🔥");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Authentication failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-200">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-black text-gray-900 font-chivo tracking-tight">FORGE</h1>
          </div>
          <p className="text-orange-600 text-sm font-manrope font-medium tracking-widest uppercase">
            Consistency forged in fire
          </p>
        </div>

        {/* Value props */}
        {!isRegistering && (
          <div className="w-full max-w-sm space-y-3 mb-10">
            {[
              { icon: "🧠", text: "AI that learns YOUR specific patterns" },
              { icon: "📊", text: "Insights no generic app can give you" },
              { icon: "🔥", text: "Adaptive coaching as you grow" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-orange-50 rounded-xl p-4 border border-orange-100">
                <span className="text-xl">{item.icon}</span>
                <p className="text-sm text-gray-700 font-manrope font-medium">{item.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Auth Form */}
        <div className="w-full max-w-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <Input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  className="w-full"
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full"
              />
            </div>

            {!isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-chivo font-bold text-sm tracking-wide uppercase py-6 rounded-xl transition-all active:scale-95 shadow-lg"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                isForgotPassword ? "Send Reset Link" : (isRegistering ? "Create Account" : "Sign In")
              )}
            </Button>
          </form>

          <div className="mt-4 space-y-2">
            {!isForgotPassword && !isRegistering && (
              <button
                onClick={() => setIsForgotPassword(true)}
                className="w-full text-sm text-gray-600 hover:text-orange-600 font-medium transition-colors"
              >
                Forgot password?
              </button>
            )}
            
            {isForgotPassword ? (
              <button
                onClick={() => {
                  setIsForgotPassword(false);
                  setFormData({ email: "", password: "", name: "" });
                }}
                className="w-full text-sm text-gray-600 hover:text-orange-600 font-medium transition-colors"
              >
                ← Back to login
              </button>
            ) : (
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="w-full text-sm text-gray-600 hover:text-orange-600 font-medium transition-colors"
              >
                {isRegistering ? "Already have an account? Sign in" : "New to FORGE? Create account"}
              </button>
            )}
          </div>
        </div>

        {/* Quote */}
        {!isRegistering && (
          <blockquote className="w-full max-w-sm text-center mt-10 px-4">
            <p className="text-gray-500 text-sm italic font-manrope leading-relaxed">
              "Most trackers give you generic motivation. Forge studies you — and tells you exactly
              what your data proves about your patterns."
            </p>
          </blockquote>
        )}
      </div>

      {/* Bottom tagline */}
      <div className="text-center pb-8 px-6">
        <p className="text-xs text-gray-300 font-manrope">
          Built on research: habits take 66 days avg, not 21
        </p>
      </div>
    </div>
  );
}
