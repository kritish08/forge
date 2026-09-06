import { useState, useEffect } from "react";
import api from "../utils/api";
import Screen from "./Screen";
import { Flame, Check, Chart } from "./icons";
import { CardSkeleton } from "./Skeleton";

// The achievement catalogue is served from GET /api/achievements/catalog. It used
// to be duplicated here, so anything added on the server rendered as a generic
// medal with no description. (An unused LEVEL_THRESHOLDS copy lived here too.)
const MAX_LEVEL = 10;

export default function Achievements() {
  const [earned, setEarned] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [achRes, statsRes, catalogRes] = await Promise.all([
          api.get("/achievements"),
          api.get("/analytics/stats"),
          api.get("/achievements/catalog"),
        ]);
        setEarned(achRes.data);
        setStats(statsRes.data);
        setCatalog(catalogRes.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);


  const earnedTypes = new Set(earned.map((a) => a.type));
  const level = stats?.level || 1;
  const totalPts = stats?.total_points || 0;
  const levelPct = stats?.level_progress_pct || 0;
  // next_level_threshold is the ABSOLUTE point total for the next level. The card
  // printed it as if it were the amount still needed, so at 175 points it claimed
  // "250 pts to Level 3" when only 75 were left.
  const pointsToNext = Math.max(0, (stats?.next_level_threshold || 100) - totalPts);
  const atMaxLevel = level >= MAX_LEVEL;

  return (
    <Screen title="Achievements" subtitle={loading ? undefined : `${earned.length} of ${catalog.length} unlocked`}>
      {loading ? (
        <div className="space-y-4"><CardSkeleton lines={2} /><CardSkeleton lines={3} /></div>
      ) : (
      <div className="space-y-5">
        {/* Level card */}
        <div data-testid="level-card"
          className="bg-accent rounded-2xl p-6 text-accent-contrast">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs font-bold opacity-80 mb-1">Current Level</p>
              <p className="text-6xl font-black font-chivo">{level}</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-70 font-manrope">Total Points</p>
              <p className="text-3xl font-black font-chivo">{totalPts.toLocaleString()}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] leading-relaxed opacity-90">
              Every check-in earns its habit's points. Levels are the running total —
              a way to see months of small days adding up.
            </p>
            <div className="flex justify-between text-xs opacity-80 font-manrope mb-1">
              <span>Level {level}</span>
              <span>
                {atMaxLevel
                  ? "Max level reached"
                  : `${pointsToNext.toLocaleString()} pts to Level ${level + 1}`}
              </span>
            </div>
            <div className="h-2.5 bg-surface-raised/20 rounded-full overflow-hidden">
              <div
                data-testid="level-progress-bar"
                className="h-full bg-surface-raised rounded-full transition-all duration-700"
                style={{ width: `${atMaxLevel ? 100 : levelPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Streak", value: `${stats?.streak || 0}d`, Icon: Flame },
            { label: "Check-ins", value: stats?.total_checkins || 0, Icon: Check },
            { label: "Consistency", value: `${stats?.completion_rate || 0}%`, Icon: Chart },
          ].map((s) => (
            <div key={s.label} className="bg-surface-raised border border-line rounded-2xl p-3 text-center">
              <s.Icon className="mx-auto mb-1.5 h-5 w-5 text-ink-muted" />
              <p className="text-lg font-black text-ink font-chivo">{s.value}</p>
              <p className="text-xs text-ink-subtle font-manrope">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Earned achievements */}
        {earned.length > 0 && (
          <div>
            <p className="text-xs font-bold text-ink-subtle font-chivo mb-3">Earned</p>
            <div className="grid grid-cols-2 gap-3">
              {earned.map((ach) => {
                const def = catalog.find((a) => a.type === ach.type);
                return (
                  <div
                    key={ach.achievement_id}
                    data-testid={`achievement-${ach.type}`}
                    className="bg-surface-raised border-2 border-accent/25 rounded-2xl p-4 shadow-sm"
                  >
                    <span className="text-3xl block mb-2">{def?.icon || "🏅"}</span>
                    <p className="font-bold font-chivo text-ink text-sm">{ach.name}</p>
                    <p className="text-xs text-ink-subtle font-manrope mt-0.5">{ach.description}</p>
                    <p className="text-xs text-accent font-manrope mt-2">
                      {new Date(ach.earned_at).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Locked achievements */}
        <div>
          <p className="text-xs font-bold text-ink-subtle font-chivo mb-3">Locked</p>
          <div className="grid grid-cols-2 gap-3">
            {catalog.filter((a) => !earnedTypes.has(a.type)).map((ach) => (
              <div
                key={ach.type}
                data-testid={`locked-achievement-${ach.type}`}
                className="bg-surface-sunk border border-line rounded-2xl p-4 opacity-50"
              >
                <span className="text-3xl block mb-2 grayscale">{ach.icon}</span>
                <p className="font-bold font-chivo text-ink-muted text-sm">{ach.name}</p>
                <p className="text-xs text-ink-subtle font-manrope mt-0.5">{ach.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </Screen>
  );
}
