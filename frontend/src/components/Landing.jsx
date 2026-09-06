import { useNavigate } from "react-router-dom";
import { Spark, Chart, Flame, Trophy, Heart, Bell } from "./icons";

// FORGE flame logo — same SVG used in Login.js header
function ForgeLogo({ size = 10, textSize = "text-2xl" }) {
    return (
        <div className="inline-flex items-center gap-2.5">
            <div
                className={`w-${size} h-${size} bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-orange-300/40`}
            >
                <svg
                    className={`w-${Math.round(size * 0.6)} h-${Math.round(size * 0.6)} text-white`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                </svg>
            </div>
            <span className={`${textSize} font-black text-ink font-chivo tracking-tight`}>
                FORGE
            </span>
        </div>
    );
}

const features = [
    {
        Icon: Spark,
        title: "AI That Learns You",
        description:
            "FORGE reads your own completion history — which days work, which don't, and when — and tells you what it actually shows.",
    },
    {
        Icon: Chart,
        title: "Pattern Intelligence",
        description:
            "Heat maps, day-of-week breakdowns and time-of-day patterns, so you can see when you follow through and when you don't.",
    },
    {
        Icon: Flame,
        title: "Streak & Momentum",
        description:
            "Points, levels and streaks give the small days something to add up to. Checking in takes about ten seconds.",
    },
    {
        Icon: Trophy,
        title: "Priority System",
        description:
            "Not every habit matters equally. Weight the important ones higher and the coach focuses its advice there.",
    },
    {
        Icon: Bell,
        title: "Daily Reminders",
        description:
            "Reminders at the times you choose, on the days you choose — and only for what's still outstanding.",
    },
    {
        Icon: Flame,
        title: "Three Coach Modes",
        description:
            "Supportive, Strategic or Direct. Pick how the coach talks to you, and change it whenever you like.",
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

import ThemeToggle from "./ThemeToggle";

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
        <div className="min-h-screen bg-surface-raised font-manrope">
            {/* ── NAV ─────────────────────────────────────────── */}
            <nav className="fixed top-0 inset-x-0 z-50 bg-surface-raised/80 /80 backdrop-blur-md border-b border-line">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <ForgeLogo size={8} textSize="text-xl" />
                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <button
                            onClick={() => handleCTA(false)}
                            className="text-sm text-ink-muted font-chivo font-bold hover:text-accent-bold transition-colors"
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => handleCTA(true)}
                            className="px-4 py-2 bg-ink dark:bg-surface-raised text-white dark:text-ink text-sm font-chivo font-bold rounded-xl hover:bg-accent dark:hover:bg-accent dark:hover:text-white transition-colors active:scale-95"
                        >
                            Get Started →
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── HERO ────────────────────────────────────────── */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-soft rounded-full blur-3xl opacity-40 -z-10" />
                <div className="absolute top-16 right-10 w-48 h-48 bg-accent/20 rounded-full blur-2xl -z-10" />

                <div className="max-w-3xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 bg-accent-soft border border-accent/25 rounded-full px-4 py-1.5 mb-6">
                        <span className="text-accent text-xs font-chivo font-bold">
                            AI-Powered Habit Intelligence
                        </span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl sm:text-6xl font-black text-ink font-chivo leading-tight tracking-tight mb-6">
                        Stop tracking habits.
                        <br />
                        <span className="text-transparent bg-clip-text bg-accent">
                            Start understanding them.
                        </span>
                    </h1>

                    <p className="text-lg text-ink-muted font-manrope leading-relaxed mb-10 max-w-2xl mx-auto">
                        FORGE doesn't just count your check-ins — it reads your patterns, learns your rhythm, and
                        gives you the exact insight you need to turn inconsistency into identity.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => handleCTA(true)}
                            className="px-8 py-4 bg-accent text-white font-chivo font-bold text-base tracking-wide rounded-2xl shadow-lg shadow-orange-300/40 hover:shadow-xl hover:shadow-orange-300/50 active:scale-95 transition-all"
                        >
                            Start free
                        </button>
                        <button
                            onClick={() => handleCTA(false)}
                            className="px-8 py-4 bg-surface-sunk border border-line text-ink font-chivo font-bold text-base rounded-2xl hover:bg-surface-sunk active:scale-95 transition-all"
                        >
                            Sign In
                        </button>
                    </div>

                    {/* Social proof row */}
                    <div className="mt-8 flex items-center justify-center gap-6 text-sm text-ink-subtle font-manrope">
                        <span>✅ Free to start</span>
                        <span>✅ No ads, ever</span>
                        <span>✅ AI-first insights</span>
                    </div>
                </div>

                {/* Mock App Preview */}
                <div className="max-w-sm mx-auto mt-16">
                    <div className="bg-surface-raised rounded-3xl shadow-2xl shadow-gray-200 border border-line overflow-hidden">
                        {/* Phone status bar */}
                        <div className="bg-ink px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-accent rounded-md flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                                    </svg>
                                </div>
                                <span className="text-white font-chivo font-bold text-sm">FORGE</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-accent" />
                                <div className="w-1 h-1 rounded-full bg-accent" />
                                <div className="w-1 h-1 rounded-full bg-line-strong" />
                            </div>
                        </div>
                        {/* Mock dashboard */}
                        <div className="p-5 bg-surface-sunk space-y-3">
                            <div className="text-xs text-ink-subtle font-chivost">Today — March 5</div>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-surface-raised rounded-xl border border-line p-3">
                                    <div className="font-chivo text-2xl font-black text-ink">12</div>
                                    <div className="text-xs text-ink-subtle mt-0.5">Day streak</div>
                                </div>
                                <div className="flex-1 bg-surface-raised rounded-xl border border-line p-3">
                                    <div className="text-2xl font-black text-accent font-chivo">3/4</div>
                                    <div className="text-xs text-ink-subtle mt-0.5">Done today</div>
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
                                    className={`flex items-center gap-3 bg-surface-raised rounded-xl border p-3 ${h.done ?"border-success/25" : "border-accent/25"
                                        }`}
                                >
                                    <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${h.done ?"bg-success"
                                                : "bg-accent"
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
                                    <span className={`text-sm font-manrope font-medium flex-1 ${h.done ?"text-ink-subtle line-through" : "text-ink"}`}>
                                        {h.name}
                                    </span>
                                    <span className="text-xs text-accent">{"★".repeat(h.stars)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── STATS ───────────────────────────────────────── */}
            <section className="py-16 bg-ink">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
                        {stats.map((s) => (
                            <div key={s.label}>
                                <div className="text-5xl font-black text-accent font-chivo mb-2">
                                    {s.value}
                                    {s.suffix}
                                </div>
                                <p className="text-ink-subtle text-sm font-manrope leading-relaxed">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FEATURES ────────────────────────────────────── */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-accent text-xs font-chivo font-bold">
                            Features
                        </span>
                        <h2 className="text-4xl font-black text-ink font-chivo mt-3 leading-tight">
                            Built different. Because you are.
                        </h2>
                        <p className="text-ink-muted mt-3 max-w-xl mx-auto font-manrope leading-relaxed">
                            Every feature in FORGE was designed around one principle: insight beats motivation.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((f) => (
                            <div
                                key={f.title}
                                className="group bg-surface-raised rounded-2xl border border-line p-6 hover:border-accent/25 hover:shadow-lg hover:shadow-orange-50 transition-all"
                            >
                                <div className="w-12 h-12 bg-accent-soft rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:bg-accent-soft transition-colors">
                                    <f.Icon className="h-6 w-6 text-accent" />
                                </div>
                                <h3 className="font-bold font-chivo text-ink text-base mb-2">{f.title}</h3>
                                <p className="text-sm text-ink-muted font-manrope leading-relaxed">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ────────────────────────────────── */}
            <section className="py-20 px-6 bg-accent-soft">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-accent text-xs font-chivo font-bold">
                            How It Works
                        </span>
                        <h2 className="text-4xl font-black text-ink font-chivo mt-3">
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
                            <div key={item.step} className="bg-surface-raised rounded-2xl p-6 shadow-sm border border-accent/25">
                                <div className="text-4xl font-black text-accent-contrast font-chivo mb-4">{item.step}</div>
                                <h3 className="font-bold font-chivo text-ink mb-2">{item.title}</h3>
                                <p className="text-sm text-ink-muted font-manrope leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ────────────────────────────────── */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <span className="text-accent text-xs font-chivo font-bold">
                            Testimonials
                        </span>
                        <h2 className="text-4xl font-black text-ink font-chivo mt-3">
                            Real people. Real patterns.
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {testimonials.map((t) => (
                            <div key={t.name} className="bg-surface-raised rounded-2xl border border-line p-6 shadow-sm">
                                <p className="text-sm text-ink-muted font-manrope leading-relaxed italic mb-5">
                                    "{t.quote}"
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold font-chivo">
                                        {t.avatar}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ink font-chivo">{t.name}</p>
                                        <p className="text-xs text-ink-subtle font-manrope">{t.role}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ───────────────────────────────────── */}
            <section className="py-20 px-6 bg-ink relative overflow-hidden">
                <div className="absolute top-0 left-1/4 w-72 h-72 bg-accent/20 rounded-full blur-3xl -z-0" />
                <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-danger/20 rounded-full blur-2xl -z-0" />
                <div className="max-w-2xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2.5 mb-6">
                        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/40">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                            </svg>
                        </div>
                        <span className="text-white font-black text-2xl font-chivo tracking-tight">FORGE</span>
                    </div>
                    <h2 className="text-4xl font-black text-white font-chivo leading-tight mb-4">
                        Ready to forge your identity?
                    </h2>
                    <p className="text-ink-subtle font-manrope leading-relaxed mb-8">
                        Consistency forged in fire. Not motivation — data.
                    </p>
                    <button
                        onClick={() => handleCTA(true)}
                        className="px-10 py-4 bg-accent text-white font-chivo font-bold text-base tracking-wide rounded-2xl shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 active:scale-95 transition-all"
                    >
                        Start building
                    </button>
                </div>
            </section>

            {/* ── FOOTER ──────────────────────────────────────── */}
            <footer className="py-10 px-6 bg-surface text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-accent rounded-md flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                        </svg>
                    </div>
                    <span className="text-white font-chivo font-bold text-sm">FORGE</span>
                </div>
                <p className="text-ink-muted text-xs font-manrope">
                    Consistency forged in fire. Habits take 66 days on average — not 21.
                </p>
                <p className="text-ink text-xs mt-2 font-manrope">
                    © {new Date().getFullYear()} FORGE. All rights reserved.
                </p>
            </footer>
        </div>
    );
}
