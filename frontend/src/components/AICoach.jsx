import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import RichText from "./RichText";
import Screen from "./Screen";
import Sheet from "./Sheet";

// Modes carry their identity in the label and a one-line description, not in
// three competing hues. The old green/blue/red chips were light-only Tailwind
// classes with no dark variant, and they made the screen look like a status
// dashboard. Only Direct gets a distinct colour, because it is the one choice
// with a consequence worth flagging.
const MODE_CONFIG = {
  supportive: { label: "Supportive", blurb: "Warm. Celebrates progress." },
  strategic: { label: "Strategic", blurb: "Analytical. Optimises." },
  direct: { label: "Direct", blurb: "Blunt. No comfort.", caution: true },
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
      toast.success("Insight ready");
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
    <Screen
      title="AI Coach"
      subtitle={`${modeConfig.label} · ${phase.phase}`}
    >
      <div className="space-y-5">
        {/* Mode selector */}
        <div className="bg-surface-raised rounded-2xl border border-line p-4">
          <p className="text-xs text-ink-subtle font-manrope mb-3">Coach Mode</p>
          <div className="flex gap-2" role="group" aria-label="Coach mode">
            {Object.entries(MODE_CONFIG).map(([id, cfg]) => {
              const active = currentMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`mode-btn-${id}`}
                  aria-pressed={active}
                  onClick={() => handleModeChange(id)}
                  className={`flex-1 rounded-xl border px-2 py-2.5 text-center transition-colors active:scale-[0.98] ${ active ? cfg.caution ?"border-danger bg-danger-soft text-danger"
                        : "border-accent bg-accent-soft text-accent-bold"
                      : "border-line text-ink-muted"
                  }`}
                >
                  <span className="block font-chivo text-[13px] font-bold">{cfg.label}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-tight opacity-80">{cfg.blurb}</span>
                </button>
              );
            })}
          </div>
          {currentMode === "direct" && user?.direct_mode_reason && (
            <div className="mt-3 rounded-xl border border-danger/25 bg-danger-soft p-3">
              <p className="text-xs text-ink-muted">
                <span className="font-semibold text-danger">Your reason:</span> {user.direct_mode_reason}
              </p>
            </div>
          )}
          {!user?.has_api_key && (
            <div className="mt-3 rounded-xl border border-warning/25 bg-warning-soft p-3">
              <p className="text-xs text-ink-muted">
                <span className="font-semibold text-warning">Using built-in insights.</span>{" "}
                The server has no AI credential configured, so these come from templates
                rather than a model.
              </p>
            </div>
          )}
        </div>

        {/* Phase progress */}
        <div className="bg-surface-raised rounded-2xl border border-line p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold font-chivo text-ink">{phase.phase}</p>
            <span className="text-xs text-ink-subtle font-manrope">{phase.desc}</span>
          </div>
          <div className="h-2 bg-surface-sunk rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (stats?.total_checkins || 0) / 50 * 100)}%` }}
            />
          </div>
          <p className="text-xs text-ink-subtle font-manrope mt-1">
            At 50+ check-ins, FORGE unlocks deep pattern analysis
          </p>
        </div>

        {/* Generate insight */}
        <div className="bg-surface-raised rounded-2xl border border-line p-5">
          <h3 className="font-bold font-chivo text-ink mb-1">Generate Insight</h3>
          <p className="text-xs text-ink-subtle font-manrope mb-4">
            Add a reflection (optional) and FORGE will analyze your patterns.
          </p>
          <textarea
            data-testid="reflection-input"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What's been working? What hasn't? Be honest..."
            className="w-full bg-surface-sunk border border-line rounded-xl px-4 py-3 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-accent mb-4"
            rows={3}
          />
          <button
            data-testid="generate-insight-btn"
            onClick={generateInsight}
            disabled={generating}
            className="w-full py-4 bg-accent text-accent-contrast font-chivo font-bold rounded-xl disabled:opacity-60 active:scale-95 transition-all"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing your data...
              </span>
            ) : (
              "Generate insight"
            )}
          </button>
        </div>

        {/* Latest insight */}
        {latestInsight && (
          <div
            data-testid="latest-insight"
            className="bg-accent rounded-2xl p-5 text-accent-contrast animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold font-chivo opacity-80">New Insight</span>
              <span className="text-xs opacity-60">{new Date(latestInsight.created_at).toLocaleDateString()}</span>
            </div>
            <RichText className="text-sm font-manrope leading-relaxed">
              {latestInsight.content}
            </RichText>
            {latestInsight.suggestions?.length > 0 && (
              <div className="mt-4 border-t border-white/20 pt-4">
                <p className="text-xs font-bold opacity-80 mb-2">Action Items</p>
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
          <div className="bg-surface-raised rounded-2xl border border-line overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="font-bold font-chivo text-ink">Past Insights</h3>
              <p className="text-xs text-ink-subtle font-manrope">FORGE remembers what it told you</p>
            </div>
            <div className="divide-y divide-line max-h-96 overflow-y-auto">
              {insights.filter((i) => i !== latestInsight).slice(0, 10).map((insight) => (
                <div key={insight.insight_id} data-testid="past-insight-item" className="px-5 py-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">
                      {MODE_CONFIG[insight.tone]?.label || insight.tone}
                    </span>
                    <span className="text-xs text-ink-subtle font-manrope">
                      {new Date(insight.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <RichText className="text-sm text-ink-muted font-manrope leading-relaxed">
                    {insight.content}
                  </RichText>
                  {insight.reflection && (
                    <p className="text-xs text-ink-subtle font-manrope mt-2 italic">
                      Your note: "{insight.reflection}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Sheet
        open={showDirectModal}
        onClose={() => { setShowDirectModal(false); setPendingMode(null); setDirectReason(""); }}
        title="Turn on Direct mode"
        description="The coach stops softening things. It will quote the reason you give below back at you."
        footer={
          <div className="flex gap-3 pb-1">
            <button
              type="button"
              onClick={() => { setShowDirectModal(false); setPendingMode(null); setDirectReason(""); }}
              className="flex-1 rounded-xl border border-line py-3 font-chivo text-sm font-bold text-ink-muted transition-transform active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-direct-mode-btn"
              onClick={confirmDirectMode}
              disabled={!directReason.trim()}
              className="flex-1 rounded-xl bg-danger py-3 font-chivo text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              Turn on
            </button>
          </div>
        }
      >
        <label className="block pb-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">Why do you want this?</span>
          <textarea
            data-testid="direct-mode-reason-input"
            value={directReason}
            onChange={(e) => setDirectReason(e.target.value)}
            rows={4}
            placeholder="e.g. I keep making excuses and talking myself out of it."
            className="w-full resize-none rounded-xl border border-line bg-surface-sunk px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
      </Sheet>
    </Screen>
  );
}
