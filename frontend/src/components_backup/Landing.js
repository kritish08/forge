import { useNavigate } from "react-router-dom";

// FORGE flame logo — same SVG used in Login.js header
function ForgeLogo({ size = 10, textSize = "text-2xl" }) {
    return (
        <div className="inline-flex items-center gap-2.5">
            <div
                className={`w-${size} h-${size} bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-300/40`}
            >
                <svg
                    className={`w-${Math.round(size * 0.6)} h-${Math.round(size * 0.6)} text-white`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                </svg>
            </div>
            <span className={`${textSize} font-black text-gray-900 font-chivo tracking-tight`}>
                FORGE
            </span>
        </div>
    );
}

const features = [
    {
        icon: "🧠",
        title: "AI That Learns You",
        description:
            "Forget generic tips. FORGE's AI studies your actual completion patterns — your best days, worst days, and timing — then gives you insight only YOUR data can unlock.",
    },
    {
        icon: "📊",
        title: "Pattern Intelligence",
        description:
            "See exactly which days you dominate and which ones you slip. Heat maps, day-of-week breakdowns, and time-of-day patterns surface the truth about your habits.",
    },
    {
        icon: "🔥",
        title: "Streak & Momentum",
        description:
            "Points, levels, and streaks keep complacency at bay. FORGE turns consistency into a game you actually want to win — with daily check-ins that take under 10 seconds.",
    },
    {
        icon: "🎯",
        title: "Priority System",
        description:
            "Not all habits are equal. Star-rank your habits by impact so your AI coach weights its advice around what truly matters to your goals — not just frequency.",
    },
    {
        icon: "📅",
        title: "Daily Reminders",
        description:
            "Push and email reminders at 8 PM — only for habits you haven't completed. No spam. Just a clean nudge for exactly what's left undone today.",
    },
    {
        icon: "⚡",
        title: "Three Coach Modes",
        description:
            "Supportive, Strategic, or Direct — choose how hard your coach pushes you. Switch modes anytime as your relationship with discipline evolves.",
    },
];

const stats = [
    { value: "66", label: "Days to build a habit — not 21", suffix: "" },
    { value: "3x", label: "More likely to succeed with data", suffix: "" },
    { value: "100%", label: "Private. Your data, your AI", suffix: "" },
];

const testimonials = [
    {
        name: "Arjun M.",
        role: "Software Engineer",
        quote:
            "I've tried every habit tracker. FORGE is the only one that actually tells me WHY I'm failing on Mondays instead of just showing me that I am.",
        avatar: "AM",
    },
    {
        name: "Priya S.",
        role: "Product Designer",
        quote:
            "The AI coach called me out for skipping evening routines after late standups. It was right. Now I've restructured my schedule around that.",
        avatar: "PS",
    },
    {
        name: "David K.",
        role: "Founder",
        quote:
            "Direct Mode is brutal and exactly what I needed. Finally a tool that doesn't sugarcoat my 40% completion rate.",
        avatar: "DK",
    },
];

export default function Landing({ onGetStarted }) {
    const navigate = useNavigate();

    const handleCTA = (isRegistering = false) => {
        if (onGetStarted) {
            onGetStarted();
        } else {
            navigate("/auth", { state: { isRegistering } });
        }
    };

    return (
        <div className="min-h-screen bg-white font-manrope">
            {/* ── NAV ─────────────────────────────────────────── */}
            <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <ForgeLogo size={8} textSize="text-xl" />
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleCTA(false)}
                            className="text-sm text-gray-600 font-chivo font-bold hover:text-orange-600 transition-colors"
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => handleCTA(true)}
                            className="px-4 py-2 bg-gray-900 text-white text-sm font-chivo font-bold rounded-xl hover:bg-orange-500 transition-colors active:scale-95"
                        >
                            Get Started →
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── HERO ────────────────────────────────────────── */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-100 rounded-full blur-3xl opacity-40 -z-10" />
                <div className="absolute top-16 right-10 w-48 h-48 bg-red-100 rounded-full blur-2xl opacity-30 -z-10" />

                <div className="max-w-3xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 mb-6">
                        <span className="text-orange-500 text-xs font-chivo font-bold tracking-widest uppercase">
                            AI-Powered Habit Intelligence
                        </span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl sm:text-6xl font-black text-gray-900 font-chivo leading-tight tracking-tight mb-6">
                        Stop tracking habits.
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
                            Start understanding them.
                        </span>
                    </h1>

                    <p className="text-lg text-gray-500 font-manrope leading-relaxed mb-10 max-w-2xl mx-auto">
                        FORGE doesn't just count your check-ins — it reads your patterns, learns your rhythm, and
                        gives you the exact insight you need to turn inconsistency into identity.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => handleCTA(true)}
                            className="px-8 py-4 bg-gradient-to-br from-orange-500 to-red-600 text-white font-chivo font-bold text-base tracking-wide rounded-2xl shadow-lg shadow-orange-300/40 hover:shadow-xl hover:shadow-orange-300/50 active:scale-95 transition-all"
                        >
                            Start Free — No Card Needed 🔥
                        </button>
                        <button
                            onClick={() => handleCTA(false)}
                            className="px-8 py-4 bg-gray-50 border border-gray-200 text-gray-900 font-chivo font-bold text-base rounded-2xl hover:bg-gray-100 active:scale-95 transition-all"
                        >
                            Sign In
                        </button>
                    </div>

                    {/* Social proof row */}
                    <div className="mt-8 flex items-center justify-center gap-6 text-sm text-gray-400 font-manrope">
                        <span>✅ Free to start</span>
                        <span>✅ No ads, ever</span>
                        <span>✅ AI-first insights</span>
                    </div>
                </div>

                {/* Mock App Preview */}
                <div className="max-w-sm mx-auto mt-16">
                    <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200 border border-gray-100 overflow-hidden">
                        {/* Phone status bar */}
                        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-md flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                                    </svg>
                                </div>
                                <span className="text-white font-chivo font-bold text-sm">FORGE</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-orange-400" />
                                <div className="w-1 h-1 rounded-full bg-orange-400" />
                                <div className="w-1 h-1 rounded-full bg-gray-600" />
                            </div>
                        </div>
                        {/* Mock dashboard */}
                        <div className="p-5 bg-gray-50 space-y-3">
                            <div className="text-xs text-gray-400 font-chivo uppercase tracking-widest">Today — March 5</div>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-3">
                                    <div className="text-2xl font-black text-gray-900 font-chivo">12🔥</div>
                                    <div className="text-xs text-gray-400 mt-0.5">Day streak</div>
                                </div>
                                <div className="flex-1 bg-white rounded-xl border border-gray-100 p-3">
                                    <div className="text-2xl font-black text-orange-500 font-chivo">3/4</div>
                                    <div className="text-xs text-gray-400 mt-0.5">Done today</div>
                                </div>
                            </div>
                            {[
                                { name: "Morning Run", done: true, stars: 3 },
                                { name: "Deep Work 2hr", done: true, stars: 3 },
                                { name: "Read 30 min", done: true, stars: 2 },
                                { name: "Evening Walk", done: false, stars: 1 },
                            ].map((h) => (
                                <div
                                    key={h.name}
                                    className={`flex items-center gap-3 bg-white rounded-xl border p-3 ${h.done ? "border-green-100" : "border-orange-100"
                                        }`}
                                >
                                    <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${h.done
                                                ? "bg-green-500"
                                                : "bg-gradient-to-br from-orange-400 to-red-500"
                                            }`}
                                    >
                                        {h.done ? (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <span className="text-white text-xs font-bold">!</span>
                                        )}
                                    </div>
                                    <span className={`text-sm font-manrope font-medium flex-1 ${h.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                        {h.name}
                                    </span>
                                    <span className="text-xs text-orange-400">{"★".repeat(h.stars)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── STATS ───────────────────────────────────────── */}
            <section className="py-16 bg-gray-900">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
                        {stats.map((s) => (
                            <div key={s.label}>
                                <div className="text-5xl font-black text-orange-500 font-chivo mb-2">
                                    {s.value}
                                    {s.suffix}
                                </div>
                                <p className="text-gray-400 text-sm font-manrope leading-relaxed">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FEATURES ────────────────────────────────────── */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-orange-500 text-xs font-chivo font-bold tracking-widest uppercase">
                            Features
                        </span>
                        <h2 className="text-4xl font-black text-gray-900 font-chivo mt-3 leading-tight">
                            Built different. Because you are.
                        </h2>
                        <p className="text-gray-500 mt-3 max-w-xl mx-auto font-manrope leading-relaxed">
                            Every feature in FORGE was designed around one principle: insight beats motivation.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((f, i) => (
                            <div
                                key={f.title}
                                className="group bg-white rounded-2xl border border-gray-100 p-6 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-50 transition-all"
                            >
                                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:bg-orange-100 transition-colors">
                                    {f.icon}
                                </div>
                                <h3 className="font-bold font-chivo text-gray-900 text-base mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 font-manrope leading-relaxed">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ────────────────────────────────── */}
            <section className="py-20 px-6 bg-orange-50">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-orange-500 text-xs font-chivo font-bold tracking-widest uppercase">
                            How It Works
                        </span>
                        <h2 className="text-4xl font-black text-gray-900 font-chivo mt-3">
                            Three steps to clarity
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
                        {[
                            {
                                step: "01",
                                title: "Add Your Habits",
                                desc: "Name your habits, set their priority level, and describe what they're for. FORGE uses this context to personalize everything.",
                            },
                            {
                                step: "02",
                                title: "Check In Daily",
                                desc: "10 seconds a day. Tap to complete. Your patterns build automatically — no journaling, no manual analysis required.",
                            },
                            {
                                step: "03",
                                title: "Get AI Insight",
                                desc: "FORGE's AI studies 14 days of your data and tells you exactly what's working, what's not, and why — in plain language.",
                            },
                        ].map((item) => (
                            <div key={item.step} className="bg-white rounded-2xl p-6 shadow-sm border border-orange-100">
                                <div className="text-4xl font-black text-orange-200 font-chivo mb-4">{item.step}</div>
                                <h3 className="font-bold font-chivo text-gray-900 mb-2">{item.title}</h3>
                                <p className="text-sm text-gray-500 font-manrope leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ────────────────────────────────── */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-orange-500 text-xs font-chivo font-bold tracking-widest uppercase">
                            Testimonials
                        </span>
                        <h2 className="text-4xl font-black text-gray-900 font-chivo mt-3">
                            Real people. Real patterns.
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {testimonials.map((t) => (
                            <div key={t.name} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                                <p className="text-sm text-gray-600 font-manrope leading-relaxed italic mb-5">
                                    "{t.quote}"
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold font-chivo">
                                        {t.avatar}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 font-chivo">{t.name}</p>
                                        <p className="text-xs text-gray-400 font-manrope">{t.role}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ───────────────────────────────────── */}
            <section className="py-20 px-6 bg-gray-900 relative overflow-hidden">
                <div className="absolute top-0 left-1/4 w-72 h-72 bg-orange-500/20 rounded-full blur-3xl -z-0" />
                <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-red-500/20 rounded-full blur-2xl -z-0" />
                <div className="max-w-2xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2.5 mb-6">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/40">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                            </svg>
                        </div>
                        <span className="text-white font-black text-2xl font-chivo tracking-tight">FORGE</span>
                    </div>
                    <h2 className="text-4xl font-black text-white font-chivo leading-tight mb-4">
                        Ready to forge your identity?
                    </h2>
                    <p className="text-gray-400 font-manrope leading-relaxed mb-8">
                        Consistency forged in fire. Not motivation — data.
                    </p>
                    <button
                        onClick={() => handleCTA(true)}
                        className="px-10 py-4 bg-gradient-to-br from-orange-500 to-red-600 text-white font-chivo font-bold text-base tracking-wide rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 active:scale-95 transition-all"
                    >
                        Start Building — It's Free 🔥
                    </button>
                </div>
            </section>

            {/* ── FOOTER ──────────────────────────────────────── */}
            <footer className="py-10 px-6 bg-gray-950 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-gradient-to-br from-orange-500 to-red-600 rounded-md flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                        </svg>
                    </div>
                    <span className="text-white font-chivo font-bold text-sm">FORGE</span>
                </div>
                <p className="text-gray-600 text-xs font-manrope">
                    Consistency forged in fire. Habits take 66 days on average — not 21.
                </p>
                <p className="text-gray-700 text-xs mt-2 font-manrope">
                    © {new Date().getFullYear()} FORGE. All rights reserved.
                </p>
            </footer>
        </div>
    );
}
