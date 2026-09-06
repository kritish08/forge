import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import BottomNav from "./components/BottomNav";
import { Toaster } from "sonner";

import { ThemeProvider } from "./context/ThemeContext";

// Routes are split so a signed-in user doesn't download the 400-line marketing
// page they'll never see again, and a signed-out visitor doesn't download the
// whole authenticated app. Dashboard is the landing screen for a signed-in user,
// so it is the one worth eagerly loading.
import Dashboard from "./components/Dashboard";

const Landing = lazy(() => import("./components/Landing"));
const Login = lazy(() => import("./components/Login"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const Onboarding = lazy(() => import("./components/Onboarding"));
const Analytics = lazy(() => import("./components/Analytics"));
const AICoach = lazy(() => import("./components/AICoach"));
const Achievements = lazy(() => import("./components/Achievements"));
const Settings = lazy(() => import("./components/Settings"));

function FullScreenLoader({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-center">
        <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-accent" />
        {label && <p className="text-sm text-ink-muted">{label}</p>}
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader label="Loading FORGE..." />;

  if (!user) return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );

  if (!user.onboarding_completed) return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes><Route path="*" element={<Onboarding />} /></Routes>
    </Suspense>
  );

  return (
    <>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/coach" element={<AICoach />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-center" richColors theme="system" />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
