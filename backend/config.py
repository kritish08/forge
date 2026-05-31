import os, logging
from pathlib import Path
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

AZURE_ENDPOINT = os.environ.get("AZURE_ENDPOINT", "https://kyrex-hub-resource.openai.azure.com/openai/v1/")
AZURE_MODEL = os.environ.get("AZURE_MODEL", "gpt-5.2")
AZURE_API_KEY = os.environ.get("AZURE_API_KEY", "")

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "")
ALGORITHM = "HS256"
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_USER = os.environ.get("SMTP_USER", "")

limiter = Limiter(key_func=get_remote_address)

DOMAIN_NAME = os.environ.get("DOMAIN_NAME", "forge.zerp.me")
APP_URL = os.environ.get("APP_URL", f"https://{DOMAIN_NAME}" if "localhost" not in DOMAIN_NAME else "http://localhost:3000")
CORS_ORIGINS_RAW = os.environ.get("CORS_ORIGINS", "")
API_URL = os.environ.get("API_URL", f"https://api-{DOMAIN_NAME}" if "localhost" not in APP_URL else "http://localhost:8001")

# Always allow the root production domains to prevent the override bug
CORS_ORIGINS = [f"https://{DOMAIN_NAME}", f"https://www.{DOMAIN_NAME}", f"https://api-{DOMAIN_NAME}"]

# Append any custom domains passed through the environment (e.g. localhost for local testing)
if CORS_ORIGINS_RAW:
    for o in CORS_ORIGINS_RAW.split(","):
        o = o.strip()
        if o and o not in CORS_ORIGINS:
            CORS_ORIGINS.append(o)

logger.info(f"Active CORS Origins: {CORS_ORIGINS}")
