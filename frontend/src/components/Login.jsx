import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";
import { Input, Button } from "./primitives";
import { Check } from "./icons";

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(location.state?.isRegistering || false);
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
        toast.success("Reset link sent. Check your email.");
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

        toast.success(isRegistering ? "Welcome to FORGE" : "Welcome back");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Couldn't sign you in. Check your email and password.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-raised flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back to home"
            className="mb-4 inline-flex items-center gap-2.5 rounded-lg transition-transform active:scale-95"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent">
              <svg className="h-6 w-6 text-accent-contrast" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
              </svg>
            </span>
            <span className="font-chivo text-3xl font-black tracking-tight text-ink">FORGE</span>
          </button>
          <p className="font-manrope text-sm font-medium text-ink-muted">
            {isRegistering ? "Start reading your own patterns." : "Consistency, forged from data."}
          </p>
        </div>

        {/* Value props — only on sign-in, kept quiet so the form leads */}
        {!isRegistering && (
          <ul className="mb-10 w-full max-w-sm space-y-3">
            {[
              "Learns which days and times you actually follow through",
              "Insights drawn from your own history, not generic advice",
              "Coaching that adapts as your habits change",
            ].map((text) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft">
                  <Check className="h-3 w-3 text-accent" />
                </span>
                <p className="font-manrope text-sm leading-snug text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Auth Form */}
        <div className="w-full max-w-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Name</label>
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
              <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
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
                <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
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
              className="w-full bg-ink text-surface font-chivo font-bold text-sm py-6 rounded-xl transition-all active:scale-95 shadow-lg"
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
                className="w-full text-sm text-ink-muted hover:text-accent-bold font-medium transition-colors"
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
                className="w-full text-sm text-ink-muted hover:text-accent-bold font-medium transition-colors"
              >
                ← Back to login
              </button>
            ) : (
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="w-full text-sm text-ink-muted hover:text-accent-bold font-medium transition-colors"
              >
                {isRegistering ? "Already have an account? Sign in" : "New to FORGE? Create account"}
              </button>
            )}
          </div>
        </div>

        {/* Quote */}
        {!isRegistering && (
          <blockquote className="w-full max-w-sm text-center mt-10 px-4">
            <p className="text-ink-muted text-sm italic font-manrope leading-relaxed">
              "Most trackers give you generic motivation. Forge studies you — and tells you exactly
              what your data proves about your patterns."
            </p>
          </blockquote>
        )}
      </div>

      {/* Bottom tagline */}
      <div className="text-center pb-8 px-6">
        <p className="text-xs text-ink-subtle font-manrope">
          Built on research: habits take 66 days avg, not 21
        </p>
      </div>
    </div>
  );
}
