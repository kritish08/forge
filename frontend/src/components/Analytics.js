import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "../utils/api";
import ForgeHeader from "./ForgeHeader";

function HeatmapGrid({ data }) {
  const cells = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const rate = data[key] ?? -1;
    cells.push({ date: key, rate });
  }

  const getColor = (rate) => {
    if (rate < 0) return "bg-gray-100 dark:bg-gray-800";
    if (rate === 0) return "bg-gray-100 dark:bg-gray-800";
    if (rate <= 0.25) return "bg-orange-100";
    if (rate <= 0.5) return "bg-orange-300";
    if (rate <= 0.75) return "bg-orange-500";
    return "bg-orange-600";
  };

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-0">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((cell, di) => (
              <div
                key={cell.date}
                className={`w-3.5 h-3.5 rounded-sm ${getColor(cell.rate)} transition-opacity hover:opacity-80`}
                title={`${cell.date}: ${cell.rate >= 0 ? Math.round(cell.rate * 100) + "%" : "No data"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-3 justify-end">
        <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope mr-1">Less</span>
        {["bg-gray-100 dark:bg-gray-800", "bg-orange-100", "bg-orange-300", "bg-orange-500", "bg-orange-600"].map((c, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope ml-1">More</span>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope">{label}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white font-chivo">{payload[0]?.value}%</p>
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState({});
  const [patterns, setPatterns] = useState(null);
  const [moods, setMoods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, heatmapRes, patternsRes, moodsRes] = await Promise.all([
          api.get("/analytics/stats"),
          api.get("/analytics/heatmap"),
          api.get("/analytics/patterns"),
          api.get("/moods?days=30"),
        ]);
        setStats(statsRes.data);
        setHeatmap(heatmapRes.data);
        setPatterns(patternsRes.data);
        setMoods(moodsRes.data);
      } catch (e) {
        console.error("Analytics load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const dowData = patterns ? Object.entries(patterns.dow_patterns).map(([day, pct]) => ({ day, pct })) : [];
  const scoreData = patterns?.score_series?.slice(-14) || [];

  const avgMoodHabitDays = (() => {
    if (!moods.length || !patterns) return null;
    const heatmapDates = Object.keys(heatmap).filter((d) => heatmap[d] > 0);
    const habitMoods = moods.filter((m) => heatmapDates.includes(m.date)).map((m) => m.rating);
    const skipMoods = moods.filter((m) => !heatmapDates.includes(m.date) || heatmap[m.date] === 0).map((m) => m.rating);
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    return { habit: avg(habitMoods), skip: avg(skipMoods) };
  })();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <ForgeHeader title="Analytics" subtitle="Your patterns, visualized" />

      <div className="px-6 pt-5 space-y-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Consistency", value: `${stats?.completion_rate || 0}%`, sub: "last 14 days", light: "bg-orange-50 border-orange-100", dark: "dark:bg-orange-950/30 dark:border-orange-900/50" },
            { label: "Current Streak", value: `${stats?.streak || 0}d`, sub: "consecutive days", light: "bg-yellow-50 border-yellow-100", dark: "dark:bg-yellow-950/30 dark:border-yellow-900/50" },
            { label: "Total Points", value: stats?.total_points || 0, sub: `Level ${stats?.level || 1}`, light: "bg-blue-50 border-blue-100", dark: "dark:bg-blue-950/30 dark:border-blue-900/50" },
            { label: "Check-ins", value: stats?.total_checkins || 0, sub: `over ${stats?.days_since_start || 0} days`, light: "bg-green-50 border-green-100", dark: "dark:bg-green-950/30 dark:border-green-900/50" },
          ].map((m) => (
            <div key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(" ", "-")}`}
              className={`${m.light} ${m.dark} border rounded-2xl p-4`}>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope uppercase tracking-widest mb-1">{m.label}</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white font-chivo">{m.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Score over time */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Score Over Time</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">Daily completion % — last 14 days</p>
          {scoreData.length > 0 ? (
            <div data-testid="score-chart" className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreData}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="pct" stroke="#F97316" strokeWidth={2}
                    fill="url(#scoreGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm font-manrope">Complete some habits to see your graph</p>
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Consistency Heatmap</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">Last 90 days of activity</p>
          <div data-testid="heatmap-grid">
            <HeatmapGrid data={heatmap} />
          </div>
        </div>

        {/* Day of week patterns */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Day-of-Week Patterns</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">Your strongest and weakest days</p>
          {dowData.length > 0 ? (
            <div data-testid="dow-chart" className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dowData} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="pct" fill="#F97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm font-manrope">Not enough data yet</p>
            </div>
          )}
        </div>

        {/* Time patterns */}
        {patterns?.time_patterns && Object.values(patterns.time_patterns).some((v) => v > 0) && (
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">When You Show Up</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">Distribution of completions by time of day</p>
            <div className="space-y-3">
              {[
                { key: "early", label: "Early (<9AM)", color: "bg-orange-600" },
                { key: "morning", label: "Morning (9-12)", color: "bg-orange-400" },
                { key: "afternoon", label: "Afternoon (12-17)", color: "bg-orange-300" },
                { key: "evening", label: "Evening (17+)", color: "bg-orange-200" },
              ].map(({ key, label, color }) => {
                const pct = patterns.time_patterns[key] || 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-500 font-manrope">{label}</span>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 font-chivo">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mood correlation */}
        {avgMoodHabitDays?.habit && (
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Mood & Habits Correlation</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">Average mood on habit vs skip days</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-green-700 font-chivo">{avgMoodHabitDays.habit}/5</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 font-manrope mt-1">Habit days</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-red-600 font-chivo">{avgMoodHabitDays.skip || "—"}/5</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 font-manrope mt-1">Skip days</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
