import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";

export default function Settings() {
  const { user, logout, refreshUser } = useAuth();
  const [habits, setHabits] = useState([]);
  const [editingHabit, setEditingHabit] = useState(null);
  const [newHabit, setNewHabit] = useState({ name: "", priority: 1, context: "" });
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("habits");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    api.get("/habits").then((r) => setHabits(r.data)).catch(console.error);
    
    // Check push notification support
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      // Check if already subscribed
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushSubscribed(!!sub);
        });
      });
    }
  }, []);

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
    try {
      const res = await api.post("/habits", newHabit);
      setHabits([...habits, res.data]);
      setNewHabit({ name: "", priority: 1, context: "" });
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

  const saveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.put("/user/settings", { azure_api_key: apiKey, ai_provider: "azure" });
      await refreshUser();
      setApiKey("");
      setShowApiKey(false);
      toast.success("API key saved securely!");
    } catch {
      toast.error("Failed to save API key.");
    } finally {
      setSaving(false);
    }
  };

  const removeApiKey = async () => {
    if (!window.confirm("Remove your API key? AI insights will use fallback templates.")) return;
    try {
      await api.put("/user/settings", { azure_api_key: " ", ai_provider: "none" });
      await refreshUser();
      toast.success("API key removed.");
    } catch {
      toast.error("Failed to remove API key.");
    }
  };

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
      setPushSubscribed(true);
      toast.success("Push notifications enabled! 🔔");
    } catch (err) {
      console.error(err);
      toast.error("Failed to enable push notifications");
    }
  };

  const unsubscribePush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
      setPushSubscribed(false);
      toast.success("Push notifications disabled");
    } catch {
      toast.error("Failed to disable push notifications");
    }
  };

  const testPush = async () => {
    try {
      await api.post("/notifications/test");
      toast.success("Test notification sent!");
    } catch {
      toast.error("Failed to send test notification");
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 pt-12 pb-4">
        <h1 className="text-2xl font-black text-gray-900 font-chivo">Settings</h1>
      </div>

      {/* Profile */}
      <div className="px-6 pt-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <div className="flex items-center gap-4">
            {user?.picture && <img src={user.picture} alt="avatar" className="w-14 h-14 rounded-full border-2 border-orange-200" />}
            <div>
              <p className="font-bold font-chivo text-gray-900 text-lg">{user?.name}</p>
              <p className="text-sm text-gray-400 font-manrope">{user?.email}</p>
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
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-5 gap-1">
          {[{ id: "habits", label: "Habits" }, { id: "notifications", label: "Notifications" }, { id: "ai", label: "AI Key" }, { id: "mode", label: "Mode" }].map((tab) => (
            <button
              key={tab.id}
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold font-chivo transition-all ${
                activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
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
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-bold font-chivo text-gray-900">Your Habits</h3>
              </div>
              {habits.length === 0 ? (
                <div className="p-5 text-center text-gray-400 text-sm font-manrope">No habits yet</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {habits.map((h) => (
                    <div key={h.habit_id} className="px-5 py-4">
                      {editingHabit?.habit_id === h.habit_id ? (
                        <div className="space-y-2">
                          <input
                            data-testid={`habit-edit-name-${h.habit_id}`}
                            value={editingHabit.name}
                            onChange={(e) => setEditingHabit({ ...editingHabit, name: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <input
                            value={editingHabit.context || ""}
                            onChange={(e) => setEditingHabit({ ...editingHabit, context: e.target.value })}
                            placeholder="What is this for?"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-manrope focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-manrope">Priority:</span>
                            {[1, 2, 3].map((p) => (
                              <button key={p} onClick={() => setEditingHabit({ ...editingHabit, priority: p })}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${editingHabit.priority === p ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                                {"⭐".repeat(p)}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingHabit(null)}
                              className="flex-1 py-2 border border-gray-200 text-gray-500 text-xs font-bold font-chivo rounded-xl">
                              Cancel
                            </button>
                            <button
                              data-testid={`habit-save-${h.habit_id}`}
                              onClick={() => updateHabit(h.habit_id, { name: editingHabit.name, priority: editingHabit.priority, context: editingHabit.context })}
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
                            <p className="text-sm font-semibold text-gray-800 font-manrope">{h.name}</p>
                            {h.context && <p className="text-xs text-gray-400 font-manrope">For: {h.context}</p>}
                          </div>
                          <button onClick={() => setEditingHabit({ ...h })}
                            className="text-gray-400 hover:text-orange-500 transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            data-testid={`habit-delete-${h.habit_id}`}
                            onClick={() => deleteHabit(h.habit_id)}
                            className="text-gray-400 hover:text-red-400 transition-colors p-1">
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
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold font-chivo text-gray-900 mb-4">Add New Habit</h3>
              <input
                data-testid="settings-habit-name"
                value={newHabit.name}
                onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
                placeholder="Habit name"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <input
                value={newHabit.context}
                onChange={(e) => setNewHabit({ ...newHabit, context: e.target.value })}
                placeholder="What is this for? (optional)"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-gray-500 font-manrope">Priority:</span>
                {[1, 2, 3].map((p) => (
                  <button key={p} onClick={() => setNewHabit({ ...newHabit, priority: p })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${newHabit.priority === p ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {"⭐".repeat(p)}
                  </button>
                ))}
              </div>
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
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold font-chivo text-gray-900 mb-1">🔔 Push Notifications</h3>
              <p className="text-xs text-gray-400 font-manrope mb-4 leading-relaxed">
                Get instant alerts when it's time to check in on your habits
              </p>

              {!pushSupported ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-sm text-gray-600 font-manrope">
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
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold font-chivo text-gray-900 mb-1">📧 Email Notifications</h3>
              <p className="text-xs text-gray-400 font-manrope mb-4 leading-relaxed">
                Receive habit reminders and weekly summaries via email
              </p>

              <div className="space-y-3">
                {/* Daily Reminder */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900 font-manrope">Daily Reminder</p>
                    <p className="text-xs text-gray-500 font-manrope">8:00 PM every day</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_daily_reminder')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      user?.email_daily_reminder ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        user?.email_daily_reminder ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Weekly Summary */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900 font-manrope">Weekly Summary</p>
                    <p className="text-xs text-gray-500 font-manrope">Every Sunday at 9:00 AM</p>
                  </div>
                  <button
                    onClick={() => toggleEmailNotifications('email_weekly_summary')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      user?.email_weekly_summary ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        user?.email_weekly_summary ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {(!process.env.REACT_APP_SMTP_HOST || process.env.REACT_APP_SMTP_HOST === '') && (
                <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                  <p className="text-xs text-yellow-700 font-manrope">
                    ⚠️ SMTP not configured. Email notifications won't be sent until SMTP settings are added to backend/.env
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Key tab */}
        {activeTab === "ai" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold font-chivo text-gray-900 mb-1">Azure AI Foundry Key</h3>
              <p className="text-xs text-gray-400 font-manrope mb-4 leading-relaxed">
                BYOK: Bring your own Azure AI Foundry API key to unlock real AI insights.
                Your key is encrypted and stored securely.
              </p>

              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-orange-700 font-chivo mb-1">Endpoint</p>
                <p className="text-xs text-orange-600 font-mono break-all">
                  https://kyrex-hub-resource.openai.azure.com/openai/v1/
                </p>
                <p className="text-xs font-bold text-orange-700 font-chivo mt-2 mb-1">Model</p>
                <p className="text-xs text-orange-600 font-mono">gpt-5.2</p>
              </div>

              {user?.has_api_key ? (
                <div>
                  <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-green-700 font-manrope font-medium">API key configured</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={testApiKey}
                      disabled={saving}
                      className="flex-1 py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? "Testing..." : "Test Key"}
                    </button>
                    <button
                      data-testid="remove-api-key-btn"
                      onClick={removeApiKey}
                      className="flex-1 py-3 border border-red-200 text-red-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-red-50 active:scale-95 transition-all"
                    >
                      Remove Key
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="relative mb-3">
                    <input
                      data-testid="api-key-input"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Azure AI API key..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono pr-12 focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    data-testid="save-api-key-btn"
                    onClick={saveApiKey}
                    disabled={!apiKey.trim() || saving}
                    className="w-full py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                  >
                    {saving ? "Saving..." : "Save API Key"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mode tab */}
        {activeTab === "mode" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold font-chivo text-gray-900 mb-1">Coach Mode</h3>
            <p className="text-xs text-gray-400 font-manrope mb-4">
              Current: <span className="font-bold text-orange-600">{user?.mode}</span>
            </p>
            <p className="text-sm text-gray-600 font-manrope leading-relaxed">
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
      </div>
    </div>
  );
}
