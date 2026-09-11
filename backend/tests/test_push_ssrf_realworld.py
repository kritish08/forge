"""Real-service check for the push SSRF fix: the validator must let legitimate
Web Push endpoints through, or the fix would break notifications for everyone.

Network-dependent (real DNS), so it is marked `integration` and deselected by
default — pytest.ini runs `-m "not integration"`. Run explicitly with:
    pytest -m integration tests/test_push_ssrf_realworld.py
"""
import os
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "forge_unit_test")
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret")

from notifications import push_endpoint_is_safe

pytestmark = pytest.mark.integration

# The real hosts browsers hand to a Web Push server, one per major engine.
REAL_PUSH_HOSTS = [
    "https://fcm.googleapis.com/fcm/send/abc:APA91bToken",              # Chrome / FCM
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABkTok",   # Firefox
    "https://web.push.apple.com/QARzGrealsubscription",                 # Safari
    "https://wns2-by3p.notify.windows.com/w/?token=BQYAABxyz",          # Edge / WNS
]


@pytest.mark.parametrize("endpoint", REAL_PUSH_HOSTS)
def test_real_push_services_are_allowed(endpoint):
    assert push_endpoint_is_safe(endpoint) is True
