import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const MODE_CONFIG = {
  supportive: { label: "Supportive", color: "text-green-600 bg-green-50 border-green-200", icon: "🌱", activeClass: "ring-2 ring-green-300" },
  strategic: { label: "Strategic", color: "text-blue-600 bg-blue-50 border-blue-200", icon: "📊", activeClass: "ring-2 ring-blue-300" },
  direct: { label: "Direct", color: "text-red-600 bg-red-50 border-red-200", icon: "⚡", activeClass: "ring-2 ring-red-300" },
};

export default function AICoach() {
  const { user, refreshUser } = useAuth();
  const [insights, setInsights] = useState([]);
  const [reflection, setReflection] = useState("");
  const [generating, setGenerating] = useState(false);
  const [latestInsight, setLatestInsight] = useState(null);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directReason, setDirectReason] = useState("");
  const [pendingMode, setPendingMode] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [insightsRes, statsRes] = await Promise.all([
          api.get("/ai/insights"),
          api.get("/analytics/stats"),
        ]);
        setInsights(insightsRes.data);
        setStats(statsRes.data);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const handleModeChange = (newMode) => {
    if (newMode === user?.mode) return;
    if (newMode === "direct") {
      setPendingMode(newMode);
      setShowDirectModal(true);
    } else {
      applyMode(newMode, "");
    }
  };

  const applyMode = async (newMode, reason) => {
    try {
      await api.put("/user/settings", { mode: newMode, direct_mode_reason: reason });
      await refreshUser();
      toast.success(`Switched to ${MODE_CONFIG[newMode].label} mode`);
    } catch {
      toast.error("Failed to switch mode.");
    }
  };

  const confirmDirectMode = async () => {
    if (!directReason.trim()) return;
    await applyMode(pendingMode, directReason);
    setShowDirectModal(false);
    setDirectReason("");
    setPendingMode(null);
  };

  const generateInsight = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/ai/insight", { reflection });
      setLatestInsight(res.data);
      setInsights((prev) => [res.data, ...prev]);
      setReflection("");
      toast.success("Insight generated!");
    } catch {
      // Was "Check your API key in Settings." — there is no API key field in
      // Settings; FORGE authenticates to Azure with one server-side credential.
      toast.error("Couldn't generate an insight. Please try again in a moment.");
    } finally {
      setGenerating(false);
    }
  };

  const currentMode = user?.mode || "supportive";
  const modeConfig = MODE_CONFIG[currentMode];

  const getPhaseText = () => {
    const total = stats?.total_checkins || 0;
    if (total < 20) return { phase: "Foundation Phase", desc: `${total}/20 check-ins — building the baseline` };
    if (total < 50) return { phase: "Pattern Recognition", desc: `${total} check-ins — patterns emerging` };
    return { phase: "Strategic Challenge", desc: `${total} check-ins — full coaching mode` };
  };

  const phase = getPhaseText();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-6 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white font-chivo">AI Coach</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${modeConfig.color}`}>
                {modeConfig.icon} {modeConfig.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope">{phase.phase}</span>
            </div>
          </div>
          {/* FORGE brand mark */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm shadow-orange-200">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
              </svg>
            </div>
            <span className="text-sm font-black text-gray-900 dark:text-white font-chivo tracking-tight">FORGE</span>
          </div>
        </div>
      </div>

      <div className="px-6 pt-5 space-y-5">
        {/* Mode selector */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope uppercase tracking-widest mb-3">Coach Mode</p>
          <div className="flex gap-2">
            {Object.entries(MODE_CONFIG).map(([id, cfg]) => (
              <button
                key={id}
                data-testid={`mode-btn-${id}`}
                onClick={() => handleModeChange(id)}
                className={`flex-1 py-2.5 px-2 rounded-xl border text-xs font-bold font-chivo transition-all active:scale-95 ${cfg.color} ${currentMode === id ? cfg.activeClass : ""}`}
              >
                {cfg.icon}<br />{cfg.label}
              </button>
            ))}
          </div>
          {currentMode === "direct" && user?.direct_mode_reason && (
            <div className="mt-3 bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-xs text-red-600 font-manrope">
                <span className="font-bold">Your reason:</span> "{user.direct_mode_reason}"
              </p>
            </div>
          )}
          {!user?.has_api_key && (
            <div className="mt-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-xl p-3">
              <p className="text-xs text-orange-700 dark:text-orange-400 font-manrope flex items-start gap-1.5">
                <span className="text-orange-500 mt-0.5">⚠️</span>
                <span>
                  The FORGE server is currently missing its AI configuration.
                  You will receive fallback template insights until the administrator sets the global API key.
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Phase progress */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold font-chivo text-gray-900 dark:text-white">{phase.phase}</p>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope">{phase.desc}</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (stats?.total_checkins || 0) / 50 * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mt-1">
            At 50+ check-ins, FORGE unlocks deep pattern analysis
          </p>
        </div>

        {/* Generate insight */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Generate Insight</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">
            Add a reflection (optional) and FORGE will analyze your patterns.
          </p>
          <textarea
            data-testid="reflection-input"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What's been working? What hasn't? Be honest..."
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 mb-4"
            rows={3}
          />
          <button
            data-testid="generate-insight-btn"
            onClick={generateInsight}
            disabled={generating}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-chivo font-bold tracking-wide uppercase rounded-xl shadow-lg shadow-orange-200 disabled:opacity-60 active:scale-95 transition-all"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing your data...
              </span>
            ) : (
              "⚡ Generate AI Insight"
            )}
          </button>
        </div>

        {/* Latest insight */}
        {latestInsight && (
          <div
            data-testid="latest-insight"
            className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-5 text-white animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold font-chivo uppercase tracking-widest opacity-80">New Insight</span>
              <span className="text-xs opacity-60">{new Date(latestInsight.created_at).toLocaleDateString()}</span>
            </div>
            <p className="text-sm font-manrope leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown>{latestInsight.content}</ReactMarkdown>
            </p>
            {latestInsight.suggestions?.length > 0 && (
              <div className="mt-4 border-t border-white/20 pt-4">
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">Action Items</p>
                {latestInsight.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5">
                    <span className="text-xs opacity-60 mt-0.5">→</span>
                    <p className="text-xs font-manrope opacity-90">{s}.</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Past insights */}
        {insights.filter((i) => i !== latestInsight).length > 0 && (
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white">Past Insights</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope">FORGE remembers what it told you</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
              {insights.filter((i) => i !== latestInsight).slice(0, 10).map((insight) => (
                <div key={insight.insight_id} data-testid="past-insight-item" className="px-5 py-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${MODE_CONFIG[insight.tone]?.color || "text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"}`}>
                      {MODE_CONFIG[insight.tone]?.label || insight.tone}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope">
                      {new Date(insight.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-500 font-manrope leading-relaxed">
                    <ReactMarkdown>{insight.content}</ReactMarkdown>
                  </p>
                  {insight.reflection && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mt-2 italic">
                      Your note: "{insight.reflection}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Direct mode activation modal */}
      {showDirectModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center">
          <div className="bg-white dark:bg-gray-950 w-full max-w-lg rounded-t-3xl p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6" />
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚡</span>
              <div>
                <h3 className="font-black font-chivo text-gray-900 dark:text-white text-lg">Activate Direct Mode</h3>
                <p className="text-sm text-gray-500 dark:text-gray-500 font-manrope">This will be brutally honest. No comfort.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-manrope text-red-700">
                Why do you want Direct Mode? The AI will reference this reason when pushing you.
                Be honest with yourself.
              </p>
            </div>
            <textarea
              data-testid="direct-mode-reason-input"
              value={directReason}
              onChange={(e) => setDirectReason(e.target.value)}
              placeholder="e.g., I keep making excuses. I need someone to call me out ruthlessly..."
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDirectModal(false); setPendingMode(null); setDirectReason(""); }}
                className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-direct-mode-btn"
                onClick={confirmDirectMode}
                disabled={!directReason.trim()}
                className="flex-1 py-3 bg-red-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl disabled:opacity-40 active:scale-95 transition-all"
              >
                Activate Direct
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
