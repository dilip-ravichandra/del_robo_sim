# ═══════════════════════════════════════════════
# DELIVERYBOT — Environment Configuration
# Copy .env.example to .env and fill in values.
# ═══════════════════════════════════════════════

import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI       = os.getenv("MONGO_URI",       "mongodb://localhost:27017")
DB_NAME         = os.getenv("DB_NAME",         "deliverybot")
JWT_SECRET      = os.getenv("JWT_SECRET",      "deliverybot-change-this-secret-key-32chars!")
JWT_ALGO        = "HS256"
JWT_EXPIRE_HOURS = 24

GMAIL_USER      = os.getenv("GMAIL_USER",      "")
GMAIL_APP_PASS  = os.getenv("GMAIL_APP_PASS",  "")

OTP_EXPIRE_MIN  = 10
