# ═══════════════════════════════════════════════
# DELIVERYBOT — Auth Handler
# bcrypt password hashing + JWT tokens
# ═══════════════════════════════════════════════

from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError

from config import JWT_SECRET, JWT_ALGO, JWT_EXPIRE_HOURS

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(email: str, name: str, role: str = "user") -> str:
    exp = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": email, "name": name, "role": role, "exp": exp},
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid/expired token."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
