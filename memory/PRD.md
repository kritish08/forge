# FORGE — The Consistency Tracker That Learns You
**Tagline:** Consistency forged in fire

## Architecture
- **Frontend:** React (CRA) + Tailwind CSS + shadcn/ui
- **Backend:** FastAPI + Motor (async MongoDB)
- **Database:** MongoDB (local)
- **Auth:** Emergent-managed Google OAuth (session tokens, 7-day expiry)
- **AI:** BYOK Azure AI Foundry (gpt-5.2) + emergentintegrations fallback + template fallback

## User Personas
- Ambitious professionals and students (20-35) who want data-driven habit optimization
- People frustrated with generic "keep it up!" motivation
- Performance-focused individuals who want their patterns analyzed and optimized

## Core Requirements (Static)
1. Daily habit check-offs with satisfying animations and point tracking
2. AI coach that references actual user data patterns (not generic advice)
3. AI memory/continuity (references past insights, tracks suggestion outcomes)
4. Three coach modes: Supportive, Strategic, Direct (with mental wellness safeguard)
5. Visual analytics: heatmap, score graph, day-of-week patterns
6. Gamification: levels 1-10, contextual achievements, streak tracking
7. Daily mood + gratitude logging with habit correlation
8. BYOK: users enter their Azure AI Foundry API key
9. Mobile-first PWA (installable, "Add to Home Screen")
10. Mental wellness intervention in Direct Mode (5+ consecutive low mood days)

## What's Been Implemented (Feb 27, 2026 - v1.0)

### Backend (server.py)
- Google OAuth session management (Emergent Auth)
- Habit CRUD (create, read, update, soft-delete)
- Completion tracking with timestamp + points
- Mood logging (1-5 scale + gratitude + wellness warning)
- Analytics: stats, heatmap (90 days), day-of-week patterns, time patterns, score series
- AI insight generation: BYOK Azure AI → emergentintegrations fallback → template fallback
- Pattern detection: time-of-day (4 buckets), day-of-week, priority breakdown
- Gamification: levels 1-10 (point thresholds), streak calculation
- Achievement system: 7 achievements (First Flame, Perfect Day, 7-day streak, etc.)
- Mental wellness intervention trigger (Direct Mode, 5+ consecutive low moods)
- API key encryption via Fernet

### Frontend Components
- **Login.js** — Google OAuth login with FORGE branding
- **AuthCallback.js** — Session exchange (handles session_id in URL hash)
- **Onboarding.js** — 3-step flow: welcome → add habits → choose mode
- **Dashboard.js** — Today view, habit check-offs, streak/points, mood log
- **Analytics.js** — Heatmap, AreaChart (score over time), BarChart (day patterns), time patterns
- **AICoach.js** — Mode selector, reflection input, insight generation, past insights with markdown
- **Achievements.js** — Level card, earned/locked achievement grid
- **Settings.js** — Profile, habit management, BYOK API key, mode info
- **BottomNav.js** — 5-tab mobile navigation
- **AuthContext.js** — Auth state provider

### Design System
- Fonts: Chivo (headings), Manrope (body), JetBrains Mono
- Colors: Orange-500 (#F97316) primary, clean white/gray surfaces
- Mobile-first, bottom navigation, safe-area support
- PWA manifest for iPhone "Add to Home Screen"
- CSS animations: check-off pop, fire pulse, page enter

## P0/P1/P2 Backlog

### P0 (Critical for v1.1)
- [ ] Add Azure AI Foundry key → user can test real AI insights
- [ ] Handle suggestion tracking (was user's suggestion followed? measure outcome)

### P1 (Important)
- [ ] Habit streak per-habit (not just overall)
- [ ] Direct Mode intensity visual shift (darker colors when in direct mode)
- [ ] Comeback bonus points (extra pts for restarting after 7-day break)
- [ ] Weekly insight summary (auto-generated on Sunday)
- [ ] Pattern insight in analytics: "Your data shows you complete 90% before 10AM"

### P2 (Nice to have)
- [ ] Habit stacking suggestions ("After coffee, then meditate")
- [ ] Voice journaling for reflections
- [ ] Social accountability partner (share progress)
- [ ] Export data (CSV/JSON)
- [ ] Advanced mood-habit causality analysis
- [ ] Push notifications (reminder system via service workers)

## Next Tasks List
1. Test with real Azure AI Foundry key to verify BYOK flow
2. Add per-habit streak tracking
3. Implement comeback bonus points
4. Add Direct Mode visual theme shift
5. Implement suggestion tracking (link AI suggestions to measurable outcomes)
