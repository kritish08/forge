import base64
import hashlib
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from config import SECRET_KEY, ALGORITHM, ENCRYPTION_KEY, logger
from db import db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Secrets at rest ─────────────────────────────────────────────────────────────
# Storage for each user's own OpenAI key. Unlike a password, this value has to be
# recoverable — we send it to OpenAI on their behalf — so it is encrypted, not
# hashed. It is never returned to the client and never logged.
# Fernet wants exactly 32 url-safe-base64 bytes, which no hand-rolled secret ever
# is — the ENCRYPTION_KEY already in use decodes to 48. Rather than make the
# deployment regenerate a credential to a shape nobody can eyeball, derive the
# Fernet key from whatever is configured. SHA-256 over a high-entropy secret is a
# fine KDF here, and it is deterministic, so restarts keep reading old ciphertext.
_fernet = None
if ENCRYPTION_KEY:
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(ENCRYPTION_KEY.encode()).digest()))
    except Exception as e:
        # Log the failure, never the key.
        logger.error("ENCRYPTION_KEY is set but unusable (%s) — per-user API keys "
                     "cannot be stored until it is fixed.", type(e).__name__)
else:
    logger.warning("ENCRYPTION_KEY is not set — users cannot save their own OpenAI key.")


def encryption_available() -> bool:
    return _fernet is not None


def encrypt_value(value: str) -> str:
    """Encrypt a secret for storage. Raises if no usable ENCRYPTION_KEY — callers
    must refuse the write rather than fall back to storing it in the clear."""
    if _fernet is None:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    return _fernet.encrypt(value.encode()).decode()


def decrypt_value(token: str) -> Optional[str]:
    """Decrypt a stored secret, or None if it can't be read — a rotated
    ENCRYPTION_KEY makes old ciphertext undecryptable, which must degrade to
    "no key on file" rather than crash the insight request."""
    if _fernet is None or not token:
        return None
    try:
        return _fernet.decrypt(token.encode()).decode()
    except Exception:
        return None


def hash_token(token: str) -> str:
    """SHA-256 of a single-use token, for storing a lookup key instead of the
    token itself. Password-reset tokens were previously written to Mongo in the
    clear, so read access to that collection was enough to complete any pending
    reset inside its one-hour window. These tokens are already high-entropy JWTs,
    so a plain digest is sufficient — no salt or work factor needed."""
    return hashlib.sha256(token.encode()).hexdigest()


# ── JWT Auth ────────────────────────────────────────────────────────────────────
def create_token(user_id: str, token_type: str, expires_minutes: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": user_id, "exp": exp, "type": token_type}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str, expected_type: Optional[str] = None) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Reject token-type confusion: a refresh/password_reset/unsubscribe token
        # must never be accepted where an access token is expected, and vice-versa.
        if expected_type is not None and payload.get("type") != expected_type:
            return None
        return payload.get("sub")
    except JWTError:
        return None

async def get_current_user(request: Request):
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_token(token, expected_type="access")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
