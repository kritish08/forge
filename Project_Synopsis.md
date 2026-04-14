# Project Synopsis: FORGE – Intelligent Habit Tracking System

## 1. Introduction
FORGE is a data-driven, intelligent habit tracking and management application designed to help users build consistency and achieve long-term goals. Unlike traditional, static habit trackers, FORGE integrates gamification, real-time analytics, and an AI-powered coaching system that adapts to each user's unique behavioral patterns. The project emphasizes actionable insights over simple data logging, providing a comprehensive toolkit for personal development.

## 2. Problem Statement
Many individuals struggle to maintain long-term consistency in personal goals and habits due to a lack of meaningful feedback, fading motivation, and rigid tracking systems. Generic tracking applications often fail because they treat all habits equally and do not provide contextual, personalized guidance when users face setbacks.

## 3. Proposed Solution
FORGE addresses these challenges by offering a dynamic, priority-based habit-tracking environment. By incorporating weightage for different habits and leveraging an AI Coach to analyze behavioral data, FORGE transforms raw data (such as streaks, completion times, and contextual logs) into personalized, actionable strategies. Gamification elements, like a progressive leveling system and unlockable achievements, maintain user engagement, while mood tracking ensures that mental well-being is considered alongside productivity.

## 4. Key Features
The system encompasses a wide range of functionally rich modules:

*   **Intelligent Habit Tracking:** Users can create priority-based habits with customizable targets, times, and context. Habits are tracked daily with timestamps.
*   **AI Coach & Contextual Insights:** An integrated AI system (powered by Azure OpenAI or customizable LLMs) analyzes completion rates, time-of-day performance, and past feedback to generate personalized insights in three adaptive modes: Supportive, Strategic, and Direct.
*   **Advanced Data Analytics:** Comprehensive visualizations, including 30-day score graphs, calendar heatmaps, and pattern analysis (identifying the user's best days and optimal times).
*   **Gamification Engine:** A robust progression system featuring 10 level tiers, contextual achievements (e.g., "7-Day Streak", "Morning Warrior", "Perfect Day"), and real-time score tracking.
*   **Mental Wellness Tracking:** Modules for daily mood check-ins and gratitude journaling, which the AI utilizes to find correlations between emotions and consistency.
*   **Automated Notifications:** Push notifications and scheduled email reminders (daily check-ins and weekly analytical summaries).
*   **Secure Authentication System:** JWT-based secure login, password hashing (Bcrypt), refresh token rotation, and rate-limiting.
*   **PWA Compatibility:** Progressive Web App capabilities for mobile-first responsiveness and installability across devices.

## 5. Technology Stack
*   **Frontend Environment:** React 18, TailwindCSS (for responsive UI), shadcn/ui (component library), Recharts (for dynamic graphs), and React Router.
*   **Backend Environment:** FastAPI (asynchronous Python web framework), Motor (Async MongoDB driver for database operations), PyJWT (Authentication), SlowAPI (Rate limiting), and APScheduler (for cron-like background tasks).
*   **Database Engine:** MongoDB 7.0 for flexible, robust NoSQL data storage.
*   **Deployment Infrastructure:** Docker & Docker Compose for containerization, designed to be served through reverse proxies like Nginx.

## 6. System Architecture
The platform is built on a modern decoupled client-server architecture. The React frontend communicates asynchronously via REST APIs to the FastAPI backend. The FastAPI server acts as a central hub, authenticating requests via JWT, pushing and querying data to the MongoDB instance, scheduling background tasks for notifications via APScheduler, and safely connecting to external large language models (Azure OpenAI) for AI coaching functionality. 

## 7. Future Scope
While the current version (V1) successfully creates a comprehensive self-improvement environment, future iterations aim to implement:
1.  **Social Accountability:** Allowing users to share progress and partake in community challenges.
2.  **Habit Stacking Suggestions:** Automated recommendations for linking complementary habits.
3.  **Advanced Pattern Detection:** Deep learning causality analysis between mood, time, and habit completion.
4.  **Dedicated Mobile Application:** Developing a native React Native application to complement the PWA.

---
*College Project Level Synopsis*
