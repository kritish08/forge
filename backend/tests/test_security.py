"""Unit tests for backend/security.py — JWT creation/validation.

Guards the Phase-0 fix: a token's `type` claim is enforced on decode, so a
refresh / password-reset / unsubscribe token can never be accepted where an
access token is expected.

security imports config + db; db builds a (lazy, non-connecting) Mongo client
at import, so we set dummy connection env before importing. No DB is contacted.
"""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "forge_unit_test")
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key")

import security  # noqa: E402  (import after env is set)


def test_token_roundtrip():
    tok = security.create_token("user_1", "access", 60)
    assert security.decode_token(tok, expected_type="access") == "user_1"


def test_decode_without_expected_type_accepts_any_valid_token():
    tok = security.create_token("user_9", "access", 60)
    assert security.decode_token(tok) == "user_9"


def test_refresh_token_rejected_as_access():
    refresh = security.create_token("user_1", "refresh", 60)
    assert security.decode_token(refresh, expected_type="access") is None
    assert security.decode_token(refresh, expected_type="refresh") == "user_1"


def test_unsubscribe_and_reset_tokens_rejected_as_access():
    for ttype in ("unsubscribe", "password_reset"):
        tok = security.create_token("user_1", ttype, 60)
        assert security.decode_token(tok, expected_type="access") is None
        assert security.decode_token(tok, expected_type=ttype) == "user_1"


def test_expired_token_returns_none():
    expired = security.create_token("user_1", "access", -1)  # already past exp
    assert security.decode_token(expired, expected_type="access") is None


def test_garbage_token_returns_none():
    assert security.decode_token("not-a-jwt", expected_type="access") is None
