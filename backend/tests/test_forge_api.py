"""
FORGE API Backend Tests
Tests all core endpoints: auth, habits, completions, moods, analytics, AI insights, achievements, settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TOKEN = "test_session_forge_001"
AUTH_HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Store created IDs for reuse across tests
habit_id = None
completion_id = None


class TestAuth:
    """Auth endpoint tests"""

    def test_auth_me_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_auth_me_with_valid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == "test-user-forge-001"
        assert data["email"] == "forge.test@example.com"
        assert "azure_api_key" not in data
        assert "has_api_key" in data


class TestHabits:
    """Habit CRUD tests"""

    def test_create_habit(self):
        global habit_id
        r = requests.post(f"{BASE_URL}/api/habits",
            json={"name": "TEST_Morning Run", "priority": 3, "context": "Health & fitness"},
            headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Morning Run"
        assert data["priority"] == 3
        assert "habit_id" in data
        habit_id = data["habit_id"]

    def test_get_habits(self):
        r = requests.get(f"{BASE_URL}/api/habits", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = [h["habit_id"] for h in data]
        assert habit_id in ids

    def test_update_habit(self):
        r = requests.put(f"{BASE_URL}/api/habits/{habit_id}",
            json={"context": "Updated context"},
            headers=AUTH_HEADERS)
        assert r.status_code == 200


class TestCompletions:
    """Completion tests"""

    def test_create_completion(self):
        global completion_id
        r = requests.post(f"{BASE_URL}/api/completions",
            json={"habit_id": habit_id},
            headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["habit_id"] == habit_id
        assert "completion_id" in data
        completion_id = data["completion_id"]

    def test_create_completion_idempotent(self):
        # Second call same day should return same object
        r = requests.post(f"{BASE_URL}/api/completions",
            json={"habit_id": habit_id},
            headers=AUTH_HEADERS)
        assert r.status_code == 200

    def test_get_completions(self):
        r = requests.get(f"{BASE_URL}/api/completions", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(c["completion_id"] == completion_id for c in data)


class TestMoods:
    """Mood tests"""

    def test_log_mood(self):
        r = requests.post(f"{BASE_URL}/api/moods",
            json={"rating": 4, "note": "Feeling great", "gratitude": "Test data"},
            headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["mood"]["rating"] == 4

    def test_get_today_mood(self):
        r = requests.get(f"{BASE_URL}/api/moods/today", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data.get("rating") == 4


class TestAnalytics:
    """Analytics endpoint tests"""

    def test_analytics_stats(self):
        r = requests.get(f"{BASE_URL}/api/analytics/stats", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "streak" in data
        assert "total_points" in data
        assert "level" in data
        assert data["total_checkins"] >= 1

    def test_analytics_heatmap(self):
        r = requests.get(f"{BASE_URL}/api/analytics/heatmap", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert len(data) == 90

    def test_analytics_patterns(self):
        r = requests.get(f"{BASE_URL}/api/analytics/patterns", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert "dow_patterns" in data
        assert "time_patterns" in data
        assert "score_series" in data


class TestAIInsight:
    """AI insight tests (uses template fallback)"""

    def test_generate_insight(self):
        r = requests.post(f"{BASE_URL}/api/ai/insight",
            json={"reflection": "Testing the insight feature"},
            headers=AUTH_HEADERS,
            timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "content" in data
        assert len(data["content"]) > 10
        assert "insight_id" in data


class TestAchievements:
    """Achievement tests"""

    def test_get_achievements(self):
        r = requests.get(f"{BASE_URL}/api/achievements", headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Should have first_checkin after creating completion
        types = [a["type"] for a in data]
        assert "first_checkin" in types


class TestSettings:
    """User settings tests"""

    def test_update_settings(self):
        r = requests.put(f"{BASE_URL}/api/user/settings",
            json={"mode": "strategic", "onboarding_completed": True},
            headers=AUTH_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["mode"] == "strategic"

    def test_revert_settings(self):
        r = requests.put(f"{BASE_URL}/api/user/settings",
            json={"mode": "supportive"},
            headers=AUTH_HEADERS)
        assert r.status_code == 200


class TestCleanup:
    """Cleanup test data"""

    def test_delete_habit(self):
        r = requests.delete(f"{BASE_URL}/api/habits/{habit_id}", headers=AUTH_HEADERS)
        assert r.status_code == 200
