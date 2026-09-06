import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import ForgeHeader from "./ForgeHeader";
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
      setNewHabit({ name: "", priority: 1, context: "", frequency_type: "daily", frequency_days: [], frequency_target: 7 });
      toast.success("Habit added!");
    } catch {
      toast.error("Failed to add habit.");
    }
  };

  const updateHabit = async (habitId, data) => {
    try {
      await api.put(`/habits/${habitId}`, data);
      setHabits(habits.map((h) => h.habit_id === habitId ? { ...h, ...data } : h));
      setEditingHabit(null);
      toast.success("Habit updated!");
    } catch {
      toast.error("Failed to update habit.");
    }
  };

  const deleteHabit = async (habitId) => {
    if (!window.confirm("Delete this habit? All completion history will remain.")) return;
    try {
      await api.delete(`/habits/${habitId}`);
      setHabits(habits.filter((h) => h.habit_id !== habitId));
      toast.success("Habit removed.");
    } catch {
      toast.error("Failed to delete habit.");
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
        toast.error("Permission denied for notifications");
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
      toast.success("Push notifications enabled! 🔔");
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
      toast.success("Test notification sent! Check your device 🔔");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to send test notification";
      toast.error("Push failed: " + msg);
    }
  };

  const toggleEmailNotifications = async (field) => {
    try {
      await api.put("/user/settings", { [field]: !user[field] });
      await refreshUser();
      toast.success("Email preferences updated");
    } catch {
      toast.error("Failed to update preferences");
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

  const deleteAccount = async () => {
    if (!deletePassword) {
      toast.error("Please enter your password to confirm.");
      return;
    }
    if (!window.confirm("WARNING: This will permanently delete your account and ALL your data. This action CANNOT be undone. Are you absolutely sure?")) return;
    
    setDeleting(true);
    try {
      await api.delete("/user/account", { data: { password: deletePassword } });
      toast.success("Account permanently deleted.");
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <ForgeHeader title="Settings" />

      {/* Profile */}
      <div className="px-6 pt-5">
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-5">
          <div className="flex items-center gap-4">
            {user?.picture && <img src={user.picture} alt="avatar" className="w-14 h-14 rounded-full border-2 border-orange-200" />}
            <div>
              <p className="font-bold font-chivo text-gray-900 dark:text-white text-lg">{user?.name}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 font-manrope">{user?.email}</p>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="mt-4 w-full py-3 border border-red-200 text-red-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-red-50 active:scale-95 transition-all"
          >
            Sign Out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 mb-5 flex-wrap gap-1">
          {[{ id: "habits", label: "Habits" }, { id: "notifications", label: "Notifications" }, { id: "ai", label: "AI Key" }, { id: "mode", label: "Mode" }, { id: "danger", label: "Danger" }].map((tab) => (
            <button
              key={tab.id}
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs sm:text-sm font-bold font-chivo transition-all ${activeTab === tab.id 
                ? (tab.id === "danger" ? "bg-red-500 text-white shadow-sm" : "bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm") 
                : "text-gray-500 dark:text-gray-500 hover:bg-gray-200"
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
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold font-chivo text-gray-900 dark:text-white">Your Habits</h3>
              </div>
              {habits.length === 0 ? (
                <div className="p-5 text-center text-gray-400 dark:text-gray-500 text-sm font-manrope">No habits yet</div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {habits.map((h) => (
                    <div key={h.habit_id} className="px-5 py-4">
                      {editingHabit?.habit_id === h.habit_id ? (
                        <div className="space-y-2">
                          <input
                            data-testid={`habit-edit-name-${h.habit_id}`}
                            value={editingHabit.name}
                            onChange={(e) => setEditingHabit({ ...editingHabit, name: e.target.value })}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <input
                            value={editingHabit.context || ""}
                            onChange={(e) => setEditingHabit({ ...editingHabit, context: e.target.value })}
                            placeholder="What is this for?"
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-500 font-manrope">Priority:</span>
                            {[1, 2, 3].map((p) => (
                              <button key={p} onClick={() => setEditingHabit({ ...editingHabit, priority: p })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${editingHabit.priority === p ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500"}`}>
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
                              className="flex-1 py-2 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 text-xs font-bold font-chivo rounded-xl">
                              Cancel
                            </button>
                            <button
                              data-testid={`habit-save-${h.habit_id}`}
                              onClick={() => updateHabit(h.habit_id, {
                                name: editingHabit.name, priority: editingHabit.priority, context: editingHabit.context,
                                frequency_type: editingHabit.frequency_type, frequency_days: editingHabit.frequency_days,
                                frequency_target: editingHabit.frequency_target
                              })}
                              className="flex-1 py-2 bg-orange-500 text-white text-xs font-bold font-chivo rounded-xl">
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((s) => (
                              <span key={s} className={`text-sm ${s <= h.priority ? "text-orange-500" : "text-gray-200"}`}>★</span>
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-manrope">{h.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {h.context && <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope">For: {h.context}</p>}
                              <FrequencyBadge habit={h} />
                            </div>
                          </div>
                          <button onClick={() => setEditingHabit({ ...h })}
                            className="text-gray-400 dark:text-gray-500 hover:text-orange-500 transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            data-testid={`habit-delete-${h.habit_id}`}
                            onClick={() => deleteHabit(h.habit_id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add habit form */}
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-4">Add New Habit</h3>
              <input
                data-testid="settings-habit-name"
                value={newHabit.name}
                onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                placeholder="Habit name"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <input
                value={newHabit.context}
                onChange={(e) => setNewHabit({ ...newHabit, context: e.target.value })}
                placeholder="What is this for? (optional)"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-gray-500 dark:text-gray-500 font-manrope">Priority:</span>
                {[1, 2, 3].map((p) => (
                  <button key={p} onClick={() => setNewHabit({ ...newHabit, priority: p })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${newHabit.priority === p ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500"}`}>
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
                className="w-full py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl disabled:opacity-40 active:scale-95 transition-all"
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
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">🔔 Push Notifications</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4 leading-relaxed">
                Get instant alerts when it's time to check in on your habits
              </p>

              {/* Server VAPID config warning */}
              {vapidConfigured === false && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <p className="text-xs text-red-700 font-manrope font-medium">
                    ⚠️ <strong>Server not configured:</strong> VAPID keys are missing from the server environment. Push notifications cannot work until <code>VAPID_PRIVATE_KEY</code> and <code>VAPID_PUBLIC_KEY</code> are added to <code>backend/.env</code>.
                  </p>
                </div>
              )}

              {!pushSupported ? (
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-500 font-manrope">
                    Push notifications are not supported in your browser
                  </p>
                </div>
              ) : pushSubscribed ? (
                <div>
                  <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-green-700 font-manrope font-medium">Push notifications enabled</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={testPush}
                      className="flex-1 py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
                    >
                      Send Test
                    </button>
                    <button
                      onClick={unsubscribePush}
                      className="flex-1 py-3 border border-red-200 text-red-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-red-50 active:scale-95 transition-all"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={subscribePush}
                  className="w-full py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
                >
                  Enable Push Notifications
                </button>
              )}

            </div>

            {/* Email Notifications */}
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">📧 Email Notifications</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4 leading-relaxed">
                Receive habit reminders and weekly summaries via email
              </p>

              <div className="space-y-3">
                {/* Daily Reminder */}
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white font-manrope">Daily Reminder</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-manrope">8:00 PM every day</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_daily_reminder')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user?.email_daily_reminder ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user?.email_daily_reminder ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>

                {/* Weekly Summary */}
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white font-manrope">Weekly Summary</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-manrope">Every Sunday at 9:00 AM</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_weekly_summary')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user?.email_weekly_summary ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user?.email_weekly_summary ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>
              </div>

              {smtpConfigured === false && (
                <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                  <p className="text-xs text-yellow-700 font-manrope">
                    ⚠️ SMTP not configured. Email notifications won't be sent until SMTP settings are added to backend/.env
                  </p>
                </div>
              )}
            </div>

            {/* Timezone & Scheduling */}
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">🌍 Timezone & Timing</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4 leading-relaxed">
                Set your timezone and when you'd like to receive your daily notifications.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-gray-900 dark:text-white font-manrope block mb-2">Timezone</label>
                  <select 
                    value={user?.timezone || "UTC"}
                    onChange={(e) => saveSettings({ timezone: e.target.value }, "Timezone updated!")}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone').map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    )) : <option value={user?.timezone || "UTC"}>{user?.timezone || "UTC"}</option>}
                  </select>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-900 dark:text-white font-manrope block">Notification Schedules</label>
                    <button
                      onClick={() => updateRules(
                        [...rules, { days: [0, 1, 2, 3, 4, 5, 6], time: "08:00" }],
                        { immediate: true, message: "Added schedule" })}
                      className="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-sm font-bold font-manrope"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg> Add
                    </button>
                  </div>

                  {rules.map((rule, idx) => {
                    const days = rule.days || [0, 1, 2, 3, 4, 5, 6];
                    const setRule = (patch, opts) => updateRules(
                      rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)), opts);
                    return (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3">
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400 text-sm font-bold font-chivo">Time</span>
                            <input
                              type="time"
                              value={rule.time || "20:00"}
                              onChange={(e) => setRule({ time: e.target.value })}
                              className="flex-1 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                          <button
                            onClick={() => updateRules(rules.filter((_, i) => i !== idx),
                                                       { immediate: true, message: "Schedule removed" })}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
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
                                className={`flex-1 h-8 rounded-lg text-xs font-bold font-chivo transition-colors ${
                                  on
                                    ? "bg-orange-500 text-white"
                                    : "bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500"
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
                    <p className="text-sm text-gray-500 dark:text-gray-500 italic py-2">No schedules set. You will not receive any daily reminders.</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Your reminders will be sent around these times in your local timezone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Key tab */}
        {activeTab === "ai" && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">AI Connection Status</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4 leading-relaxed">
                Forge is globally connected to your private Azure AI Foundry workspace.
              </p>

              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-orange-700 dark:text-orange-400 font-chivo mb-1">Current State</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 font-manrope">
                  Globally Authenticated via Backend Host
                </p>
              </div>

              <div>
                <button
                  onClick={testApiKey}
                  disabled={saving}
                  className="w-full py-3 bg-gray-900 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? "Pinging Azure Servers..." : "Test AI Model Connection"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode tab */}
        {activeTab === "mode" && (
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Coach Mode</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope mb-4">
              Current: <span className="font-bold text-orange-600">{user?.mode}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-500 font-manrope leading-relaxed">
              To change your coach mode, visit the <a href="/coach" className="text-orange-500 font-bold">AI Coach</a> page
              and select a different mode. Direct Mode requires an activation reason.
            </p>
            {user?.mode === "direct" && user?.direct_mode_reason && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 font-chivo mb-1">Your Direct Mode reason:</p>
                <p className="text-sm text-red-600 font-manrope">"{user.direct_mode_reason}"</p>
              </div>
            )}
          </div>
        )}
        {/* Danger Zone tab */}
        {activeTab === "danger" && (
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-red-200 dark:border-red-900/50 p-5">
            <h3 className="font-bold font-chivo text-red-600 mb-1">Danger Zone</h3>
            <p className="text-sm text-gray-600 dark:text-gray-500 font-manrope leading-relaxed mb-4">
              Permanently delete your account and all associated data (habits, check-ins, moods, achievements, insights). 
              <strong className="block mt-1">This action cannot be undone.</strong>
            </p>
            
            <div className="space-y-4 pt-4 border-t border-red-100">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 font-manrope mb-2">
                  Confirm Password to Delete Account:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-red-200 rounded-xl px-4 py-3 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <button
                onClick={deleteAccount}
                disabled={!deletePassword || deleting}
                className="w-full py-3 bg-red-600 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
