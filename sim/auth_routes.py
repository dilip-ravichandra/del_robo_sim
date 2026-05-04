# ═══════════════════════════════════════════════
# DELIVERYBOT — Authentication Routes
# /auth/register · /auth/verify-email
# /auth/login    · /auth/verify-login
# /auth/forgot-password · /auth/reset-password
# /auth/me
# ═══════════════════════════════════════════════

import asyncio
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from database import get_db
from auth_handler import hash_password, verify_password, create_token, decode_token
from email_service import email_service
from config import OTP_EXPIRE_MIN

router   = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# ── Helpers ───────────────────────────────────────────────────────────

def _gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _otp_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MIN)


def _mask_email(email: str) -> str:
    parts = email.split("@")
    if len(parts) != 2:
        return email
    user = parts[0]
    masked = user[:2] + "*" * max(0, len(user) - 2)
    return f"{masked}@{parts[1]}"


# ── Pydantic models ───────────────────────────────────────────────────

class RegisterReq(BaseModel):
    name:     str
    email:    str
    password: str
    role:     str = "student"

class VerifyEmailReq(BaseModel):
    email: str
    otp:   str

class LoginReq(BaseModel):
    email:    str
    password: str

class VerifyLoginReq(BaseModel):
    email: str
    otp:   str

class ForgotPasswordReq(BaseModel):
    email: str

class ResetPasswordReq(BaseModel):
    email:        str
    otp:          str
    new_password: str

class ResendOTPReq(BaseModel):
    email:   str
    purpose: str   # "register" | "login" | "reset"


# ── Auth dependency ───────────────────────────────────────────────────

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        return decode_token(creds.credentials)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")


# ── Routes ────────────────────────────────────────────────────────────

@router.post("/register")
async def register(req: RegisterReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    if not req.name.strip() or not req.email.strip() or not req.password.strip():
        raise HTTPException(400, "All fields are required")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(409, "Email already registered")

    otp = _gen_otp()
    await db.users.insert_one({
        "name":          req.name.strip(),
        "email":         req.email.lower().strip(),
        "password_hash": hash_password(req.password),
        "role":          req.role,
        "verified":      False,
        "otp":           otp,
        "otp_expiry":    _otp_expiry(),
        "otp_purpose":   "register",
        "created_at":    datetime.utcnow(),
    })

    sent = await asyncio.to_thread(email_service.send_otp, req.email, req.name.strip(), otp, "register")
    return {
        "ok": True,
        "message": "OTP sent to your email" if sent else "Account created (email not configured — OTP printed to server console)",
        "dev_otp": otp if not sent else None,
        "masked_email": _mask_email(req.email),
    }


@router.post("/verify-email")
async def verify_email(req: VerifyEmailReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("verified"):
        return {"ok": True, "message": "Already verified"}
    if user.get("otp") != req.otp or user.get("otp_purpose") != "register":
        raise HTTPException(400, "Invalid OTP")
    if datetime.utcnow() > user.get("otp_expiry", datetime.min):
        raise HTTPException(400, "OTP expired — request a new one")

    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"verified": True, "otp": None, "otp_expiry": None, "otp_purpose": None}},
    )
    return {"ok": True, "message": "Email verified — you can now log in"}


@router.post("/login")
async def login(req: LoginReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if not user.get("verified"):
        raise HTTPException(403, "Email not verified — check your inbox")

    otp = _gen_otp()
    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"otp": otp, "otp_expiry": _otp_expiry(), "otp_purpose": "login"}},
    )
    sent = await asyncio.to_thread(email_service.send_otp, req.email, user["name"], otp, "login")
    return {
        "ok": True,
        "message": "OTP sent — check your email",
        "dev_otp": otp if not sent else None,
        "masked_email": _mask_email(req.email),
    }


@router.post("/verify-login")
async def verify_login(req: VerifyLoginReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("otp") != req.otp or user.get("otp_purpose") != "login":
        raise HTTPException(400, "Invalid OTP")
    if datetime.utcnow() > user.get("otp_expiry", datetime.min):
        raise HTTPException(400, "OTP expired — log in again")

    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"otp": None, "otp_expiry": None, "otp_purpose": None}},
    )
    token = create_token(req.email.lower(), user["name"], user.get("role", "user"))
    return {
        "ok":    True,
        "token": token,
        "name":  user["name"],
        "email": req.email.lower(),
        "role":  user.get("role", "user"),
    }


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(404, "No account found with that email")

    otp = _gen_otp()
    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"otp": otp, "otp_expiry": _otp_expiry(), "otp_purpose": "reset"}},
    )
    sent = await asyncio.to_thread(email_service.send_otp, req.email, user["name"], otp, "reset")
    return {
        "ok": True,
        "message": "Password reset OTP sent to your email",
        "dev_otp": otp if not sent else None,
        "masked_email": _mask_email(req.email),
    }


@router.post("/reset-password")
async def reset_password(req: ResetPasswordReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("otp") != req.otp or user.get("otp_purpose") != "reset":
        raise HTTPException(400, "Invalid OTP")
    if datetime.utcnow() > user.get("otp_expiry", datetime.min):
        raise HTTPException(400, "OTP expired — request a new reset link")
    if len(req.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {
            "password_hash": hash_password(req.new_password),
            "otp":           None,
            "otp_expiry":    None,
            "otp_purpose":   None,
        }},
    )
    return {"ok": True, "message": "Password reset successfully — you can now log in"}


@router.post("/resend-otp")
async def resend_otp(req: ResendOTPReq):
    db = get_db()
    if db is None:
        raise HTTPException(503, "Database unavailable")

    user = await db.users.find_one({"email": req.email.lower()})
    if not user:
        raise HTTPException(404, "User not found")

    otp = _gen_otp()
    await db.users.update_one(
        {"email": req.email.lower()},
        {"$set": {"otp": otp, "otp_expiry": _otp_expiry(), "otp_purpose": req.purpose}},
    )
    sent = await asyncio.to_thread(email_service.send_otp, req.email, user["name"], otp, req.purpose)
    return {
        "ok": True,
        "dev_otp": otp if not sent else None,
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "email": current_user["sub"],
        "name":  current_user.get("name"),
        "role":  current_user.get("role"),
    }
