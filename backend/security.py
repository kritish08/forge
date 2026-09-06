import hashlib
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from config import SECRET_KEY, ALGORITHM
from db import db

# NOTE: encrypt_value/decrypt_value (Fernet, keyed on ENCRYPTION_KEY) used to live
# here. They were the storage layer for the per-user Azure key, which the settings
# model no longer accepts and the settings UI no longer offers — so they were
# called from nowhere. Removed along with the rest of that dead path.

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
