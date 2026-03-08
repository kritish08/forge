import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./components/Landing";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import Analytics from "./components/Analytics";
import AICoach from "./components/AICoach";
import Achievements from "./components/Achievements";
import Settings from "./components/Settings";
import BottomNav from "./components/BottomNav";
import { Toaster } from "sonner";

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-manrope tracking-widest uppercase">Loading FORGE...</p>
        </div>
      </div>
    );
  }

  if (!user) return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
  if (!user.onboarding_completed) return <Routes><Route path="*" element={<Onboarding />} /></Routes>;

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/coach" element={<AICoach />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
