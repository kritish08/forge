from pydantic import BaseModel, Field
from typing import Optional

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    picture: str = ""
    timezone: str = "UTC"

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordReset(BaseModel):
    token: str
    new_password: str

class HabitCreate(BaseModel):
    name: str
    priority: int = 1
    context: str = ""
    target_time: str = ""
    color: str = "#F97316"
    frequency_type: str = "daily"          # "daily" | "specific_days" | "times_per_week"
    frequency_days: list = []              # [0,1,2,3,4,5,6] — 0=Mon, 6=Sun (ISO weekday)
    frequency_target: int = 7              # For times_per_week: how many days per week (1-7)

class HabitUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    context: Optional[str] = None
    target_time: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    frequency_type: Optional[str] = None
    frequency_days: Optional[list] = None
    frequency_target: Optional[int] = None

class CompletionCreate(BaseModel):
    habit_id: str
    date: Optional[str] = None

class MoodCreate(BaseModel):
    rating: int
    note: str = ""
    gratitude: str = ""

class InsightRequest(BaseModel):
    reflection: str = ""

class UserSettingsUpdate(BaseModel):
    # NOTE: pydantic drops unknown keys silently, so a field missing from this
    # model makes its endpoint a no-op that still returns 200. That is exactly
    # how the old `azure_api_key` write appeared to succeed while saving nothing.
    # The OpenAI key itself is deliberately NOT here: it needs encrypting before
    # storage, so it has its own endpoint rather than riding this generic $set.
    mode: Optional[str] = None
    direct_mode_reason: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    email_daily_reminder: Optional[bool] = None
    email_weekly_summary: Optional[bool] = None
    # The scheduler has always gated push on this, but it was in no model and no
    # UI, so it was permanently True and the check was decorative.
    push_notifications_enabled: Optional[bool] = None
    timezone: Optional[str] = None
    notification_rules: Optional[list] = None
    # Which OpenAI model this user's insights are generated with. Not a secret.
    ai_model: Optional[str] = Field(default=None, max_length=100)

class AIKeyRequest(BaseModel):
    """A user's own OpenAI key. Validated against OpenAI before it is stored, and
    never echoed back — responses carry only a masked hint."""
    api_key: str = Field(min_length=20, max_length=300)
    model: Optional[str] = Field(default=None, max_length=100)

class PushSubscribeRequest(BaseModel):
    subscription: dict

class DeleteAccountRequest(BaseModel):
    password: str
