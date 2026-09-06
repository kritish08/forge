# 🔥 FORGE - Intelligent Habit Tracker

**Consistency forged in fire.**

FORGE is a data-driven habit tracking application with AI-powered insights, advanced analytics, and gamification. Unlike generic trackers, FORGE learns your unique patterns and provides personalized coaching that evolves with your progress.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green.svg)](https://fastapi.tiangolo.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-brightgreen.svg)](https://www.mongodb.com/)

---

## ✨ Features

### 🎯 Core Habit Tracking
- **Priority-based habits** with weighted points (⭐ = 1pt, ⭐⭐ = 2pts, ⭐⭐⭐ = 3pts)
- **Daily check-ins** with timestamps
- **Streak tracking** with automatic calculation
- **Context tracking** - log why each habit matters to you

### 📊 Advanced Analytics
- **Score graphs** - 30-day completion trends
- **Heatmap calendar** - visual consistency overview
- **Pattern analysis:**
  - Best/worst days of the week
  - Time-of-day performance (early, morning, afternoon, evening)
  - Priority-level breakdown
- **Real-time stats** - streaks, completion rates, level progress

### 🤖 AI Coach
- **Adaptive tone** - Choose from Supportive, Strategic, or Direct mode
- **Contextual insights** - AI analyzes YOUR data, not generic advice
- **Memory system** - Tracks past suggestions and their outcomes
- **Server-managed AI** - One Azure credential configured on the server, with built-in fallback templates when it is absent

### 🎮 Gamification
- **Level system** with 10 tiers (0 → 9000+ points)
- **Contextual achievements:**
  - First Flame, Perfect Day, 7-Day Streak, Forge Legend, Centurion
  - Morning Warrior, Comeback King
- **Real-time progress tracking**

### 🧘 Mental Wellness
- **Daily mood check-ins** (1-5 scale)
- **Gratitude journal** (optional)
- **Safety feature** - Direct Mode includes low mood monitoring with crisis resources

### 🔔 Notifications
- **Push notifications** (browser-based, PWA-ready)
- **Email reminders** - Daily (8 PM) and Weekly summaries (Sundays 9 AM)
- **In-app toasts** for real-time feedback

### 🔐 Authentication
- **Email/password registration & login**
- **JWT-based authentication** with secure refresh tokens
- **Password reset** via email (1-hour token expiration)
- **Rate limiting** to prevent abuse

### 📱 PWA Support
- **Installable** on mobile devices
- **Offline-ready** with service workers
- **Mobile-first design** with responsive layout

---

## 🛠️ Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **React Router** - Navigation
- **Axios** - API client
- **Sonner** - Toast notifications

Charts are hand-drawn SVG (`src/components/charts.jsx`) rather than a charting
library — the app has two of them, and they need to be theme-aware and usable by
touch.

### Backend
- **FastAPI** - Modern Python web framework
- **Motor** - Async MongoDB driver
- **PyJWT** - JWT authentication
- **Passlib + Bcrypt** - Password hashing
- **APScheduler** - Scheduled jobs (notifications)
- **SlowAPI** - Rate limiting
- **AIOSMTPLIB** - Email sending
- **PyWebPush** - Push notifications

### Database
- **MongoDB 7.0** - NoSQL database

### Deployment
- **Docker & Docker Compose** - Containerization
- **Nginx** (recommended) - Reverse proxy
- **Ubuntu VPS** - Production target

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** and **Yarn**
- **Python 3.11+**
- **MongoDB 7.0+**

### Local Development

#### 1. Clone the repository
```bash
git clone https://github.com/yourusername/forge.git
cd forge
```

#### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your configurations

# Run backend
uvicorn server:app --reload --port 8001
```

#### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
yarn install --frozen-lockfile

# Configure environment
cp .env.example .env
# Edit .env and set VITE_BACKEND_URL=http://localhost:8001

# Run frontend
yarn dev
```

Visit `http://localhost:3000` 🎉

---

## 🐳 Docker Deployment

### Production Setup (Ubuntu VPS)

#### 1. Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

#### 2. Configure Environment
```bash
# Edit backend/.env
MONGO_URL=mongodb://mongo:27017
DB_NAME=forge_db
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>

# Optional: Add SMTP for emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password

# Edit frontend/.env
VITE_BACKEND_URL=https://yourdomain.com   # build-time only, see note below
```

#### 3. Deploy
```bash
docker-compose -f compose.yaml up -d --build
```

#### 4. Setup Nginx + SSL (Optional)
See [DEPLOYMENT.md](./DEPLOYMENT.md) for full production setup with HTTPS.

---

## 📖 API Documentation

Once running, visit:
- **Backend API Docs:** `http://localhost:8001/docs` (Swagger UI)
- **Alternative Docs:** `http://localhost:8001/redoc` (ReDoc)

### Key Endpoints

**Authentication:**
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

**Habits:**
- `GET /api/habits` - List habits
- `POST /api/habits` - Create habit
- `PUT /api/habits/{id}` - Update habit
- `DELETE /api/habits/{id}` - Delete habit

**Completions:**
- `POST /api/completions` - Check in habit
- `GET /api/completions` - Get completions

**Analytics:**
- `GET /api/analytics/stats` - Overview stats
- `GET /api/analytics/heatmap` - Calendar heatmap data
- `GET /api/analytics/patterns` - Behavioral patterns

**AI Coach:**
- `POST /api/ai/insight` - Generate AI insight

**Notifications:**
- `POST /api/notifications/subscribe` - Subscribe to push
- `POST /api/notifications/test` - Test notification

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
```env
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=forge_db

# Security
JWT_SECRET_KEY=<your-secret-key>

# CORS
CORS_ORIGINS=http://localhost:3000

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=FORGE <noreply@yourdomain.com>

# Push Notifications (Optional)
VAPID_PRIVATE_KEY=<generate with web-push CLI>
VAPID_PUBLIC_KEY=<generate with web-push CLI>

# AI (Optional) - one server-side credential, shared by all users
AZURE_ENDPOINT=https://your-resource.openai.azure.com/openai/v1/
AZURE_MODEL=gpt-5.2
AZURE_API_KEY=<your-azure-key>

# App
APP_URL=http://localhost:3000
```

### Frontend (`frontend/.env`)
```env
VITE_BACKEND_URL=http://localhost:8001
```

> **This is a build-time variable, not a runtime one.** Vite inlines it into the
> bundle when the image is built, so `docker compose` passes it as a build arg
> (see `compose.yaml`); a runtime `env_file` on the nginx container cannot reach
> it. `frontend/.env` is used for local `yarn dev` only and is excluded from the
> Docker build context. The Dockerfile fails the build if the arg is empty.

---

## 📸 Screenshots

### Authentication
- Clean login/registration with email & password
- Forgot password flow with email reset link

### Dashboard
- Real-time streak and points tracking
- Daily habit checklist with priority indicators
- Mood check-in widget

### Analytics
- 30-day score trends
- Calendar heatmap
- Day-of-week and time-of-day patterns

### AI Coach
- Mode selection (Supportive, Strategic, Direct)
- Contextual insights based on your data
- Suggestion tracking system

### Settings
- Habit management
- Notification preferences (Push + Email toggles)
- AI API key configuration
- Coach mode customization

---

## 🧪 Testing

```bash
# Backend unit tests (pure logic + JWT security)
cd backend
pip install -r requirements-dev.txt
pytest

# Frontend unit tests
cd frontend
yarn test --watchAll=false
```

Both suites run on every push and pull request — see `.github/workflows/ci.yml`.
The frontend build runs there with `CI=true`, so lint warnings fail the build.

---

## 📋 Roadmap

### V1 (Current)
- ✅ Core habit tracking
- ✅ Analytics & visualizations
- ✅ AI coach with memory
- ✅ Gamification
- ✅ Mood tracking
- ✅ JWT authentication
- ✅ Notifications (Push + Email)
- ✅ PWA support
- ✅ Docker deployment

### V2 (Planned)
- [ ] Social accountability (share progress)
- [ ] Habit stacking suggestions
- [ ] Voice journaling
- [ ] Advanced pattern detection (mood-habit causality)
- [ ] Community challenges
- [ ] Mobile apps (React Native)
- [ ] API rate limiting per user
- [ ] Multi-language support

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Keep commits atomic and well-described

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **shadcn/ui** - Beautiful component library
- **Recharts** - Data visualization
- **FastAPI** - Modern Python framework
- **MongoDB** - Flexible NoSQL database

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/forge/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/forge/discussions)
- **Email:** support@yourdomain.com

---

## 🔗 Links

- **Live Demo:** [https://forge-demo.yourdomain.com](https://forge-demo.yourdomain.com)
- **Documentation:** [Full Deployment Guide](./DEPLOYMENT.md)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---

**Built with 🔥 by [Your Name]**

*"Consistency forged in fire."*
