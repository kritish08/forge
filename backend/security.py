import os
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet
from config import SECRET_KEY, ALGORITHM
from db import db

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")
fernet = None
if ENCRYPTION_KEY:
    try:
        fernet = Fernet(ENCRYPTION_KEY.encode())
    except Exception:
        pass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def encrypt_value(v: str) -> str:
    if fernet and v:
        return fernet.encrypt(v.encode()).decode()
    return v

def decrypt_value(v: str) -> str:
    if fernet and v:
        try:
            return fernet.decrypt(v.encode()).decode()
        except Exception:
            return v
    return v


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
