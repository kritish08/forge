import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";

const ALL_ACHIEVEMENTS = [
  { type: "first_checkin", name: "First Flame", description: "Complete your first habit", icon: "🔥" },
  { type: "perfect_day", name: "First Perfect Day", description: "Complete all habits in one day", icon: "⭐" },
  { type: "streak_7", name: "7-Day Streak", description: "7 consecutive days", icon: "💪" },
  { type: "streak_30", name: "Forge Legend", description: "30 consecutive days", icon: "🏆" },
  { type: "checkins_100", name: "Centurion", description: "100 habit check-ins", icon: "💯" },
  { type: "morning_warrior", name: "Morning Warrior", description: "10 completions before 9AM", icon: "🌅" },
  { type: "comeback", name: "Comeback King", description: "Restart after a 7-day break", icon: "👑" },
];

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1500, 2500, 4000, 6000, 9000];

export default function Achievements() {
  const [earned, setEarned] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [achRes, statsRes] = await Promise.all([
          api.get("/achievements"),
          api.get("/analytics/stats"),
        ]);
        setEarned(achRes.data);
        setStats(statsRes.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const earnedTypes = new Set(earned.map((a) => a.type));
  const level = stats?.level || 1;
  const totalPts = stats?.total_points || 0;
  const levelPct = stats?.level_progress_pct || 0;
  const nextThreshold = stats?.next_level_threshold || 100;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-6 pt-12 pb-4">
        <h1 className="text-2xl font-black text-gray-900 font-chivo">Achievements</h1>
        <p className="text-xs text-gray-400 font-manrope mt-0.5">
          {earned.length}/{ALL_ACHIEVEMENTS.length} unlocked
        </p>
      </div>

      <div className="px-6 pt-5 space-y-5">
        {/* Level card */}
        <div data-testid="level-card"
          className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-orange-200">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Current Level</p>
              <p className="text-6xl font-black font-chivo">{level}</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-70 font-manrope">Total Points</p>
              <p className="text-3xl font-black font-chivo">{totalPts.toLocaleString()}</p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs opacity-80 font-manrope mb-1">
              <span>Level {level}</span>
              <span>{nextThreshold.toLocaleString()} pts to Level {Math.min(level + 1, 10)}</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                data-testid="level-progress-bar"
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${levelPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Streak", value: `${stats?.streak || 0}d`, icon: "🔥" },
            { label: "Check-ins", value: stats?.total_checkins || 0, icon: "✅" },
            { label: "Consistency", value: `${stats?.completion_rate || 0}%`, icon: "📊" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-3 text-center">
              <p className="text-xl mb-1">{s.icon}</p>
              <p className="text-lg font-black text-gray-900 font-chivo">{s.value}</p>
              <p className="text-xs text-gray-400 font-manrope">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Earned achievements */}
        {earned.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest font-chivo mb-3">Earned</p>
            <div className="grid grid-cols-2 gap-3">
              {earned.map((ach) => {
                const def = ALL_ACHIEVEMENTS.find((a) => a.type === ach.type);
                return (
                  <div
                    key={ach.achievement_id}
                    data-testid={`achievement-${ach.type}`}
                    className="bg-white border-2 border-orange-200 rounded-2xl p-4 shadow-sm"
                  >
                    <span className="text-3xl block mb-2">{def?.icon || "🏅"}</span>
                    <p className="font-bold font-chivo text-gray-900 text-sm">{ach.name}</p>
                    <p className="text-xs text-gray-400 font-manrope mt-0.5">{ach.description}</p>
                    <p className="text-xs text-orange-400 font-manrope mt-2">
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
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest font-chivo mb-3">Locked</p>
          <div className="grid grid-cols-2 gap-3">
            {ALL_ACHIEVEMENTS.filter((a) => !earnedTypes.has(a.type)).map((ach) => (
              <div
                key={ach.type}
                data-testid={`locked-achievement-${ach.type}`}
                className="bg-gray-50 border border-gray-100 rounded-2xl p-4 opacity-50"
              >
                <span className="text-3xl block mb-2 grayscale">{ach.icon}</span>
                <p className="font-bold font-chivo text-gray-600 text-sm">{ach.name}</p>
                <p className="text-xs text-gray-400 font-manrope mt-0.5">{ach.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
