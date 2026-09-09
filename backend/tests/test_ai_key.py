"""Unit tests for the bring-your-own-key path — backend/security.py encryption,
backend/ai.py credential resolution, and the serializer that decides what the
client is allowed to see about an account.

The two failure modes worth guarding are opposites: a stored key that cannot be
read back (insights silently fall to templates), and a stored key that leaks into
an API response.

Modules import config, which reads backend/.env; env is set here first so the
tests run identically in CI, where no .env exists.
"""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "forge_unit_test")
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key")
os.environ["ENCRYPTION_KEY"] = "unit-test-encryption-key-not-a-fernet-key"
os.environ["OPENAI_MODEL"] = "gpt-4o-mini"
os.environ["OPENAI_API_KEY"] = ""

import ai  # noqa: E402
import security  # noqa: E402

SAMPLE_KEY = "sk-proj-0123456789abcdefWXYZ"


# ── encryption at rest ──────────────────────────────────────────────────────────
def test_encryption_is_available_with_an_arbitrary_secret():
    """The configured ENCRYPTION_KEY is a 64-char hex string, not the 32
    url-safe-base64 bytes Fernet demands, so the key is derived rather than used
    directly. Any non-empty secret must therefore work."""
    assert security.encryption_available()


def test_encrypt_decrypt_roundtrip():
    assert security.decrypt_value(security.encrypt_value(SAMPLE_KEY)) == SAMPLE_KEY


def test_ciphertext_does_not_contain_the_plaintext():
    assert SAMPLE_KEY not in security.encrypt_value(SAMPLE_KEY)


def test_encryption_is_not_deterministic_across_calls():
    assert security.encrypt_value(SAMPLE_KEY) != security.encrypt_value(SAMPLE_KEY)


def test_decrypt_of_garbage_returns_none_rather_than_raising():
    """A rotated ENCRYPTION_KEY leaves undecryptable ciphertext behind. That has
    to read as "no key on file", not crash every insight request."""
    assert security.decrypt_value("not-a-fernet-token") is None
    assert security.decrypt_value("") is None


# ── credential resolution ───────────────────────────────────────────────────────
def test_no_key_anywhere_resolves_to_no_source():
    key, model, source = ai.resolve_ai_credentials({})
    assert key is None and source is None
    assert model == "gpt-4o-mini"


def test_user_key_is_decrypted_and_wins():
    user = {"openai_api_key_enc": security.encrypt_value(SAMPLE_KEY), "ai_model": "gpt-4o"}
    key, model, source = ai.resolve_ai_credentials(user)
    assert key == SAMPLE_KEY
    assert model == "gpt-4o"
    assert source == "user"


def test_user_model_falls_back_to_the_default_when_unset():
    user = {"openai_api_key_enc": security.encrypt_value(SAMPLE_KEY)}
    _, model, _ = ai.resolve_ai_credentials(user)
    assert model == "gpt-4o-mini"


def test_unreadable_user_key_falls_through_instead_of_being_used():
    key, _, source = ai.resolve_ai_credentials({"openai_api_key_enc": "corrupt"})
    assert key is None and source is None


def test_server_key_is_the_fallback(monkeypatch):
    monkeypatch.setattr(ai, "OPENAI_API_KEY", "sk-server-key")
    key, _, source = ai.resolve_ai_credentials({})
    assert key == "sk-server-key"
    assert source == "server"


def test_user_key_beats_the_server_key(monkeypatch):
    monkeypatch.setattr(ai, "OPENAI_API_KEY", "sk-server-key")
    user = {"openai_api_key_enc": security.encrypt_value(SAMPLE_KEY)}
    key, _, source = ai.resolve_ai_credentials(user)
    assert key == SAMPLE_KEY
    assert source == "user"


# ── what reaches the client ─────────────────────────────────────────────────────
def _user_doc(**extra):
    doc = {"user_id": "u1", "email": "a@b.c", "name": "A", "password_hash": "bcrypt$hash"}
    doc.update(extra)
    return doc


def test_public_user_never_returns_the_stored_key_or_password():
    from server import public_user
    doc = _user_doc(openai_api_key_enc=security.encrypt_value(SAMPLE_KEY))
    safe = public_user(doc)
    assert "password_hash" not in safe
    assert "openai_api_key_enc" not in safe
    # Belt and braces: neither the plaintext nor the ciphertext in any value.
    assert SAMPLE_KEY not in repr(safe)
    assert doc["openai_api_key_enc"] not in repr(safe)


def test_public_user_hint_is_only_the_last_four_characters():
    from server import public_user
    safe = public_user(_user_doc(openai_api_key_enc=security.encrypt_value(SAMPLE_KEY)))
    assert safe["ai_key_hint"] == "…WXYZ"
    assert safe["has_api_key"] is True
    assert safe["ai_configured"] is True
    assert safe["ai_key_source"] == "user"


def test_public_user_without_a_key_reports_templates():
    from server import public_user
    safe = public_user(_user_doc())
    assert safe["has_api_key"] is False
    assert safe["ai_configured"] is False
    assert safe["ai_key_hint"] == ""


def test_public_user_separates_has_api_key_from_ai_configured(monkeypatch):
    """A server fallback key means insights work, but the account still has no
    key of its own — the settings card and the coach banner read different flags."""
    from server import public_user
    monkeypatch.setattr(ai, "OPENAI_API_KEY", "sk-server-key")
    safe = public_user(_user_doc())
    assert safe["has_api_key"] is False
    assert safe["ai_configured"] is True
    assert safe["ai_key_source"] == "server"
    assert safe["ai_key_hint"] == ""


# ── settings model ──────────────────────────────────────────────────────────────
def test_settings_model_accepts_ai_model_and_still_drops_the_key():
    """The key must not ride the generic settings $set — it needs encrypting. And
    ai_model must be declared, or the write is a 200 that saves nothing."""
    from models import UserSettingsUpdate
    parsed = UserSettingsUpdate(ai_model="gpt-4o", openai_api_key="sk-should-be-dropped")
    dumped = parsed.model_dump()
    assert dumped["ai_model"] == "gpt-4o"
    assert "openai_api_key" not in dumped
