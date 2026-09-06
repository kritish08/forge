import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { invalidate } from "../hooks/useCachedQuery";
import { toast } from "sonner";
import Screen from "./Screen";
import { ConfirmSheet } from "./Sheet";
import { Bell, Mail, Globe, Pencil, Trash } from "./icons";
import TimezoneField from "./TimezoneField";
import { FrequencyPicker, FrequencyBadge } from "./FrequencyPicker";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Settings() {
  const { user, logout, refreshUser } = useAuth();
  const [habits, setHabits] = useState([]);
  const [editingHabit, setEditingHabit] = useState(null);
  const [newHabit, setNewHabit] = useState({ name: "", priority: 1, context: "", frequency_type: "daily", frequency_days: [], frequency_target: 7 });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [activeTab, setActiveTab] = useState("habits");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(null); // null=loading, true/false
  const [smtpConfigured, setSmtpConfigured] = useState(null); // null=loading, true/false

  useEffect(() => {
    api.get("/habits").then((r) => setHabits(r.data)).catch(console.error);

    // Check push notification support
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushSubscribed(!!sub);
        });
      });
    }

    // Check server VAPID key and SMTP config
    api.get("/notifications/status").then(r => {
      setVapidConfigured(r.data.vapid_configured);
      setSmtpConfigured(r.data.smtp_configured);
    }).catch(() => {
      setVapidConfigured(false);
      setSmtpConfigured(false);
    });
  }, []);

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
    if (newHabit.frequency_type === "specific_days" && newHabit.frequency_days.length === 0) {
      toast.error("Select at least one day for Specific Days frequency.");
      return;
    }
    try {
      const res = await api.post("/habits", newHabit);
      setHabits([...habits, res.data]);
      invalidate("habits", "stats");
      setNewHabit({ name: "", priority: 1, context: "", frequency_type: "daily", frequency_days: [], frequency_target: 7 });
      toast.success("Habit added");
    } catch {
      toast.error("Failed to add habit.");
    }
  };

  const updateHabit = async (habitId, data) => {
    try {
      await api.put(`/habits/${habitId}`, data);
      setHabits(habits.map((h) => h.habit_id === habitId ? { ...h, ...data } : h));
      invalidate("habits", "stats");
      setEditingHabit(null);
      toast.success("Habit updated");
    } catch {
      toast.error("Failed to update habit.");
    }
  };

  // window.confirm was system chrome that broke the app illusion on mobile, and
  // an installed PWA can suppress it outright.
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteHabit = async () => {
    const habit = confirmDelete;
    if (!habit) return;
    try {
      await api.delete(`/habits/${habit.habit_id}`);
      setHabits((hs) => hs.filter((h) => h.habit_id !== habit.habit_id));
      invalidate("habits", "stats");
      toast.success(`${habit.name} removed`);
    } catch {
      toast.error("Couldn't remove that habit. Try again.");
    } finally {
      setConfirmDelete(null);
    }
  };

  // NOTE: saveApiKey/removeApiKey used to live here. They PUT `azure_api_key`
  // and `ai_provider` to /user/settings — fields UserSettingsUpdate does not
  // declare, so pydantic dropped them, the endpoint returned 200, and the UI
  // reported "API key saved securely!" while storing nothing. The AI tab that
  // called them was replaced by the server-authenticated status panel, so this
  // was unreachable dead code on top of being broken.

  const testApiKey = async () => {
    setSaving(true);
    try {
      const res = await api.post("/user/test-ai-key");
      if (res.data.success) {
        toast.success(res.data.message + " ✅");
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to test API key";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const subscribePush = async () => {
    if (!pushSupported) {
      toast.error("Push notifications not supported in this browser");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error("Your browser blocked notifications. Allow them in site settings to turn this on.");
        return;
      }

      const vapidRes = await api.get("/notifications/vapid-key");
      const publicKey = vapidRes.data.public_key;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await api.post("/notifications/subscribe", { subscription: subscription.toJSON() });
      await saveSettings({ push_notifications_enabled: true });
      setPushSubscribed(true);
      toast.success("Push notifications on");
    } catch (err) {
      console.error("Push Sub Error:", err);
      toast.error("Failed to enable push: " + (err.message || "Unknown error"));
    }
  };

  const unsubscribePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
      // The browser-side unsubscribe was all this used to do, so the server kept
      // a subscription it could no longer deliver to and went on pushing at a
      // dead endpoint every day. Clear it server-side too.
      await api.delete("/notifications/subscribe");
      await saveSettings({ push_notifications_enabled: false });
      setPushSubscribed(false);
      toast.success("Push notifications disabled");
    } catch {
      toast.error("Failed to disable push notifications");
    }
  };

  const testPush = async () => {
    try {
      await api.post("/notifications/test");
      toast.success("Test sent — check your device");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to send test notification";
      toast.error("Push failed: " + msg);
    }
  };

  const toggleEmailNotifications = async (field) => {
    try {
      await api.put("/user/settings", { [field]: !user[field] });
      await refreshUser();
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save that. Try again.");
    }
  };

  // Single entry point for timezone / notification-schedule writes so a failed
  // PUT surfaces an error toast instead of silently leaving the UI out of sync.
  // Notification rules are edited locally and persisted on a debounce. Each
  // keystroke in <input type="time"> fires onChange, and this used to PUT
  // /user/settings and then refetch /auth/me for every one of them.
  const [rules, setRules] = useState(user?.notification_rules || []);
  const rulesTimer = useRef(null);

  useEffect(() => {
    setRules(user?.notification_rules || []);
  }, [user?.notification_rules]);

  useEffect(() => () => clearTimeout(rulesTimer.current), []);

  const updateRules = (next, { immediate = false, message } = {}) => {
    setRules(next);
    clearTimeout(rulesTimer.current);
    if (immediate) {
      saveSettings({ notification_rules: next }, message);
    } else {
      rulesTimer.current = setTimeout(
        () => saveSettings({ notification_rules: next }, message), 800);
    }
  };

  const saveSettings = async (payload, successMsg) => {
    try {
      await api.put("/user/settings", payload);
      await refreshUser();
      if (successMsg) toast.success(successMsg);
    } catch {
      toast.error("Failed to save settings. Please try again.");
    }
  };

  const [confirmWipe, setConfirmWipe] = useState(false);

  const deleteAccount = async () => {
    setConfirmWipe(false);
    if (!deletePassword) {
      toast.error("Enter your password to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/user/account", { data: { password: deletePassword } });
      toast.success("Account deleted");
      localStorage.removeItem("access_token");
      window.location.href = "/";
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to delete account. Please check your password.";
      toast.error(msg);
      setDeleting(false);
    }
  };

  // Helper to convert VAPID key
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  return (
    <Screen title="Settings">
      <div>
        <div className="bg-surface-raised rounded-2xl border border-line p-5 mb-5">
          <div className="flex items-center gap-4">
            {user?.picture && <img src={user.picture} alt="avatar" className="w-14 h-14 rounded-full border-2 border-accent/25" />}
            <div>
              <p className="font-bold font-chivo text-ink text-lg">{user?.name}</p>
              <p className="text-sm text-ink-subtle font-manrope">{user?.email}</p>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="mt-4 w-full py-3 border border-danger/25 text-danger font-chivo font-bold text-sm rounded-xl hover:bg-danger-soft active:scale-95 transition-all"
          >
            Sign Out
          </button>
        </div>

        {/* Three tabs, not five. "AI Key" had become a static status panel and
            "Mode" was a paragraph telling you to go to the Coach tab — two of
            five tabs did nothing, on a 375px-wide screen. Both now live inside
            Account, where they belong. */}
        <div className="mb-5 flex gap-1 rounded-xl bg-surface-sunk p-1">
          {[
            { id: "habits", label: "Habits" },
            { id: "notifications", label: "Reminders" },
            { id: "account", label: "Account" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`flex-1 rounded-lg py-2 font-chivo text-sm font-semibold transition-colors ${
                activeTab === tab.id ? "bg-surface-raised text-ink shadow-row" : "text-ink-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Habits tab */}
        {activeTab === "habits" && (
          <div className="space-y-4">
            {/* Existing habits */}
            <div className="bg-surface-raised rounded-2xl border border-line overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <h3 className="font-bold font-chivo text-ink">Your Habits</h3>
              </div>
              {habits.length === 0 ? (
                <div className="p-5 text-center text-ink-subtle text-sm font-manrope">No habits yet</div>
              ) : (
                <div className="divide-y divide-line">
                  {habits.map((h) => (
                    <div key={h.habit_id} className="px-5 py-4">
                      {editingHabit?.habit_id === h.habit_id ? (
                        <div className="space-y-2">
                          <input
                            data-testid={`habit-edit-name-${h.habit_id}`}
                            value={editingHabit.name}
                            onChange={(e) => setEditingHabit({ ...editingHabit, name: e.target.value })}
                            className="w-full bg-surface-sunk border border-line rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                          <input
                            value={editingHabit.context || ""}
                            onChange={(e) => setEditingHabit({ ...editingHabit, context: e.target.value })}
                            placeholder="What is this for?"
                            className="w-full bg-surface-sunk border border-line rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-muted font-manrope">Priority:</span>
                            {[1, 2, 3].map((p) => (
                              <button key={p} onClick={() => setEditingHabit({ ...editingHabit, priority: p })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${editingHabit.priority === p ?"bg-accent text-accent-contrast" : "bg-surface-sunk text-ink-muted"}`}>
                                {"⭐".repeat(p)}
                              </button>
                            ))}
                          </div>
                          <FrequencyPicker
                            frequencyType={editingHabit.frequency_type || "daily"}
                            frequencyDays={editingHabit.frequency_days || []}
                            frequencyTarget={editingHabit.frequency_target || 7}
                            onChange={(f) => setEditingHabit({ ...editingHabit, ...f })}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setEditingHabit(null)}
                              className="flex-1 py-2 border border-line text-ink-muted text-xs font-bold font-chivo rounded-xl">
                              Cancel
                            </button>
                            <button
                              data-testid={`habit-save-${h.habit_id}`}
                              onClick={() => updateHabit(h.habit_id, {
                                name: editingHabit.name, priority: editingHabit.priority, context: editingHabit.context,
                                frequency_type: editingHabit.frequency_type, frequency_days: editingHabit.frequency_days,
                                frequency_target: editingHabit.frequency_target
                              })}
                              className="flex-1 py-2 bg-accent text-accent-contrast text-xs font-bold font-chivo rounded-xl">
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((s) => (
                              <span key={s} className={`text-sm ${s <= h.priority ?"text-accent" : "text-ink-subtle"}`}>★</span>
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink font-manrope">{h.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {h.context && <p className="text-xs text-ink-subtle font-manrope">For: {h.context}</p>}
                              <FrequencyBadge habit={h} />
                            </div>
                          </div>
                          <button onClick={() => setEditingHabit({ ...h })}
                            className="text-ink-subtle hover:text-accent transition-colors p-1">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            data-testid={`habit-delete-${h.habit_id}`}
                            onClick={() => setConfirmDelete(h)}
                            className="text-ink-subtle hover:text-danger transition-colors p-1">
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add habit form */}
            <div className="bg-surface-raised rounded-2xl border border-line p-5">
              <h3 className="font-bold font-chivo text-ink mb-4">Add New Habit</h3>
              <input
                data-testid="settings-habit-name"
                value={newHabit.name}
                onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                placeholder="Habit name"
                className="w-full bg-surface-sunk border border-line rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                value={newHabit.context}
                onChange={(e) => setNewHabit({ ...newHabit, context: e.target.value })}
                placeholder="What is this for? (optional)"
                className="w-full bg-surface-sunk border border-line rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-ink-muted font-manrope">Priority:</span>
                {[1, 2, 3].map((p) => (
                  <button key={p} onClick={() => setNewHabit({ ...newHabit, priority: p })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${newHabit.priority === p ?"bg-accent text-accent-contrast" : "bg-surface-sunk text-ink-muted"}`}>
                    {"⭐".repeat(p)}
                  </button>
                ))}
              </div>
              <FrequencyPicker
                frequencyType={newHabit.frequency_type}
                frequencyDays={newHabit.frequency_days}
                frequencyTarget={newHabit.frequency_target}
                onChange={(f) => setNewHabit({ ...newHabit, ...f })}
              />
              <div className="mt-3" />
              <button
                data-testid="settings-add-habit-btn"
                onClick={addHabit}
                disabled={!newHabit.name.trim()}
                className="w-full py-3 bg-accent text-accent-contrast font-chivo font-bold text-sm rounded-xl disabled:opacity-40 active:scale-95 transition-all"
              >
                + Add Habit
              </button>
            </div>
          </div>
        )}

        {/* Notifications tab */}
        {activeTab === "notifications" && (
          <div className="space-y-4">
            {/* Push Notifications */}
            <div className="bg-surface-raised rounded-2xl border border-line p-5">
              <h3 className="mb-1 flex items-center gap-2 font-chivo font-bold text-ink"><Bell className="h-[18px] w-[18px] text-ink-muted" />Push Notifications</h3>
              <p className="text-xs text-ink-subtle font-manrope mb-4 leading-relaxed">
                Get instant alerts when it's time to check in on your habits
              </p>

              {/* Server VAPID config warning */}
              {vapidConfigured === false && (
                <div className="bg-danger-soft border border-danger/25 rounded-xl p-3 mb-4">
                  <p className="text-xs text-danger font-manrope font-medium">
                    ⚠️ <strong>Server not configured:</strong> VAPID keys are missing from the server environment. Push notifications cannot work until <code>VAPID_PRIVATE_KEY</code> and <code>VAPID_PUBLIC_KEY</code> are added to <code>backend/.env</code>.
                  </p>
                </div>
              )}

              {!pushSupported ? (
                <div className="bg-surface-sunk border border-line rounded-xl p-3">
                  <p className="text-sm text-ink-muted font-manrope">
                    Push notifications are not supported in your browser
                  </p>
                </div>
              ) : pushSubscribed ? (
                <div>
                  <div className="flex items-center gap-2 bg-success-soft border border-success/25 rounded-xl p-3 mb-3">
                    <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-success font-manrope font-medium">Push notifications enabled</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={testPush}
                      className="flex-1 py-3 bg-accent text-accent-contrast font-chivo font-bold text-sm rounded-xl hover:bg-accent-bold active:scale-95 transition-all"
                    >
                      Send Test
                    </button>
                    <button
                      onClick={unsubscribePush}
                      className="flex-1 py-3 border border-danger/25 text-danger font-chivo font-bold text-sm rounded-xl hover:bg-danger-soft active:scale-95 transition-all"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={subscribePush}
                  className="w-full py-3 bg-accent text-accent-contrast font-chivo font-bold text-sm rounded-xl hover:bg-accent-bold active:scale-95 transition-all"
                >
                  Enable Push Notifications
                </button>
              )}

            </div>

            {/* Email Notifications */}
            <div className="bg-surface-raised rounded-2xl border border-line p-5">
              <h3 className="mb-1 flex items-center gap-2 font-chivo font-bold text-ink"><Mail className="h-[18px] w-[18px] text-ink-muted" />Email Notifications</h3>
              <p className="text-xs text-ink-subtle font-manrope mb-4 leading-relaxed">
                Receive habit reminders and weekly summaries via email
              </p>

              <div className="space-y-3">
                {/* Daily Reminder */}
                <div className="flex items-center justify-between bg-surface-sunk rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-ink font-manrope">Daily Reminder</p>
                    <p className="text-xs text-ink-muted font-manrope">8:00 PM every day</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_daily_reminder')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user?.email_daily_reminder ? 'bg-accent' : 'bg-line-strong dark:bg-line-strong' }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface-raised transition-transform ${user?.email_daily_reminder ? 'translate-x-6' : 'translate-x-1' }`}
                    />
                  </button>
                </div>

                {/* Weekly Summary */}
                <div className="flex items-center justify-between bg-surface-sunk rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-ink font-manrope">Weekly Summary</p>
                    <p className="text-xs text-ink-muted font-manrope">Every Sunday at 9:00 AM</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_weekly_summary')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user?.email_weekly_summary ? 'bg-accent' : 'bg-line-strong dark:bg-line-strong' }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface-raised transition-transform ${user?.email_weekly_summary ? 'translate-x-6' : 'translate-x-1' }`}
                    />
                  </button>
                </div>
              </div>

              {smtpConfigured === false && (
                <div className="mt-4 bg-warning-soft border border-warning/25 rounded-xl p-3">
                  <p className="text-xs text-warning font-manrope">
                    ⚠️ SMTP not configured. Email notifications won't be sent until SMTP settings are added to backend/.env
                  </p>
                </div>
              )}
            </div>

            {/* Timezone & Scheduling */}
            <div className="bg-surface-raised rounded-2xl border border-line p-5">
              <h3 className="mb-1 flex items-center gap-2 font-chivo font-bold text-ink"><Globe className="h-[18px] w-[18px] text-ink-muted" />Timezone & Timing</h3>
              <p className="text-xs text-ink-subtle font-manrope mb-4 leading-relaxed">
                Set your timezone and when you'd like to receive your daily notifications.
              </p>
              
              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">Timezone</span>
                  <TimezoneField
                    value={user?.timezone || "UTC"}
                    onChange={(tz) => saveSettings({ timezone: tz }, "Timezone updated")}
                  />
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    This decides when your day rolls over and when reminders arrive.
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-ink font-manrope block">Notification Schedules</label>
                    <button
                      onClick={() => updateRules(
                        [...rules, { days: [0, 1, 2, 3, 4, 5, 6], time: "08:00" }],
                        { immediate: true, message: "Added schedule" })}
                      className="text-accent hover:bg-accent-soft p-1.5 rounded-lg transition-colors flex items-center gap-1 text-sm font-bold font-manrope"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg> Add
                    </button>
                  </div>

                  {rules.map((rule, idx) => {
                    const days = rule.days || [0, 1, 2, 3, 4, 5, 6];
                    const setRule = (patch, opts) => updateRules(
                      rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)), opts);
                    return (
                      <div key={idx} className="bg-surface-sunk border border-line rounded-xl p-3 space-y-3">
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-ink-muted text-sm font-bold font-chivo">Time</span>
                            <input
                              type="time"
                              value={rule.time || "20:00"}
                              onChange={(e) => setRule({ time: e.target.value })}
                              className="flex-1 bg-surface-raised border border-line rounded-lg px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-accent/40"
                            />
                          </div>
                          <button
                            onClick={() => updateRules(rules.filter((_, i) => i !== idx),
                                                       { immediate: true, message: "Schedule removed" })}
                            className="p-2 text-ink-subtle hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                            title="Remove schedule"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>

                        {/* Per-day selection. The backend has always filtered
                            rules by weekday (logic.due_daily_slot), but the UI
                            only ever wrote every day, so "weekdays only" was
                            impossible despite being fully implemented. */}
                        <div className="flex gap-1.5">
                          {DAY_LABELS.map((label, d) => {
                            const on = days.includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                aria-pressed={on}
                                aria-label={DAY_NAMES[d]}
                                onClick={() => {
                                  const next = on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
                                  if (next.length === 0) {
                                    toast.error("Pick at least one day, or remove the schedule.");
                                    return;
                                  }
                                  setRule({ days: next }, { immediate: true });
                                }}
                                className={`flex-1 h-8 rounded-lg text-xs font-bold font-chivo transition-colors ${ on ?"bg-accent text-accent-contrast"
                                    : "bg-surface-raised border border-line text-ink-subtle"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {rules.length === 0 && (
                    <p className="text-sm text-ink-muted italic py-2">No schedules set. You will not receive any daily reminders.</p>
                  )}
                  <p className="text-xs text-ink-muted mt-2">
                    Your reminders will be sent around these times in your local timezone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Key tab */}
        {activeTab === "account" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <h3 className="mb-1 font-chivo font-bold text-ink">Coach mode</h3>
              <p className="text-sm leading-relaxed text-ink-muted">
                Currently <span className="font-semibold text-ink">{user?.mode}</span>.
                Change it on the <a href="/coach" className="font-semibold text-accent-bold underline underline-offset-2">Coach</a> tab,
                where you can read what each mode does first.
              </p>
              {user?.mode === "direct" && user?.direct_mode_reason && (
                <div className="mt-3 rounded-xl border border-danger/25 bg-danger-soft p-3">
                  <p className="text-xs text-ink-muted">
                    <span className="font-semibold text-danger">Your reason:</span> {user.direct_mode_reason}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <h3 className="mb-1 font-chivo font-bold text-ink">AI insights</h3>
              <p className="mb-4 text-sm leading-relaxed text-ink-muted">
                FORGE talks to Azure with a credential held on the server — there's
                no key for you to manage.
              </p>
              <button
                type="button"
                onClick={testApiKey}
                disabled={saving}
                className="w-full rounded-xl border border-line py-3 font-chivo text-sm font-bold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Checking…" : "Test the connection"}
              </button>
            </div>

            <div className="rounded-2xl border border-danger/25 bg-surface-raised p-5">
              <h3 className="mb-1 font-chivo font-bold text-danger">Delete account</h3>
              <p className="mb-4 text-sm leading-relaxed text-ink-muted">
                Erases your habits, check-ins, moods, achievements and insights.
                This can't be undone.
              </p>
<label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Confirm your password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full rounded-xl border border-line bg-surface-sunk px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
                />
              </label>
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                disabled={!deletePassword || deleting}
                className="mt-3 w-full rounded-xl bg-danger py-3 font-chivo text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmSheet
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deleteHabit}
        destructive
        title={`Remove ${confirmDelete?.name ?? "this habit"}?`}
        description="It disappears from your daily list. Your past check-ins stay, so your history and streaks are unaffected."
        confirmLabel="Remove"
      />

      <ConfirmSheet
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        onConfirm={deleteAccount}
        destructive
        busy={deleting}
        title="Delete your account?"
        description="This erases your habits, check-ins, moods, achievements and insights. It cannot be undone."
        confirmLabel="Delete everything"
      />
    </Screen>
  );
}
