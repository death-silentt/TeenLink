import base64
import asyncio
import hashlib
import hmac
import json
import os
import random
import re
import secrets
import smtplib
import string
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import shutil
import time
from typing import Any

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import Base, engine, get_db
from frontend import ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE, STATIC_DIR, UPLOADS_DIR, configure_frontend
from models import User, FriendRequest, UserNickname

ALPHABET = string.ascii_uppercase + string.digits
TEMP_ID_ALPHABET = string.ascii_uppercase + string.digits
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
OTP_TTL_MINUTES = 10
JWT_COOKIE_NAME = "teenlink_token"
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))
PASSWORD_ITERATIONS = 120_000
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TeenLink")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
GIPHY_API_KEY = os.getenv("GIPHY_API_KEY", "")
active_connections: dict[str, WebSocket] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="TeenLink E2EE Prototype",
    description="Privacy-first WebRTC chat prototype with client-side encryption.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

configure_frontend(app)


class RegisterRequest(BaseModel):
    email: str

class SetNameRequest(BaseModel):
    email: str
    first_name: str = Field(min_length=1, max_length=25)
    last_name: str = Field(min_length=1, max_length=25)

class NicknameRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)


class VerifyRequest(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)


class SetPasswordRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=256)


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=256)


class VisibilityUpdate(BaseModel):
    is_public: bool


class FriendRequestCreate(BaseModel):
    receiver_id: str


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_avatar_url(user: User) -> str:
    """Return the user's custom profile image URL, or a DiceBear auto-generated avatar seeded by user.id."""
    if user.profile_image_url:
        return user.profile_image_url
    seed = str(user.id)
    return (
        f"https://api.dicebear.com/9.x/initials/svg"
        f"?seed={urllib.parse.quote(seed)}"
        f"&backgroundColor=818cf8,4ade80,fb7185,fb923c"
        f"&backgroundType=gradientLinear"
        f"&fontWeight=600"
    )


def validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Invalid email address.")
    return normalized


def generate_candidate_id() -> str:
    return "".join(random.choices(ALPHABET, k=6))


def generate_temp_id() -> str:
    return "T" + "".join(random.choices(TEMP_ID_ALPHABET, k=5))


async def generate_unique_user_id(db: AsyncSession, temporary: bool = False) -> str:
    generator = generate_temp_id if temporary else generate_candidate_id
    for _ in range(50):
        candidate = generator()
        existing = await db.get(User, candidate)
        if existing is None:
            return candidate
    raise HTTPException(status_code=500, detail="Unable to generate a unique user ID.")


def generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _send_email(recipient_email: str, subject: str, body: str) -> None:
    """Low-level helper that sends a plain-text email via the configured SMTP."""
    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        raise HTTPException(status_code=500, detail="SMTP is not configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = recipient_email
    message.set_content(body)

    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            if SMTP_USERNAME:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        server.ehlo()
        if SMTP_USE_TLS:
            server.starttls()
            server.ehlo()
        if SMTP_USERNAME:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)


def send_otp_email(recipient_email: str, otp: str) -> None:
    subject = "Your TeenLink verification code"
    body = (
        f"Your TeenLink verification code is {otp}.\n\n"
        f"This code expires in {OTP_TTL_MINUTES} minutes.\n"
        "If you did not request this code, you can ignore this email.\n"
    )
    _send_email(recipient_email, subject, body)


def send_password_reset_otp_email(recipient_email: str, otp: str) -> None:
    subject = "TeenLink Password Reset"
    body = (
        f"Your TeenLink password-reset code is {otp}.\n\n"
        f"This code expires in {OTP_TTL_MINUTES} minutes.\n"
        "If you did not request a password reset, you can safely ignore this email.\n"
    )
    _send_email(recipient_email, subject, body)


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")


def b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def sign_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    encoded_header = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{b64url_encode(signature)}"


def decode_jwt(token: str) -> dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token.") from exc

    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    expected_signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_signature, b64url_decode(encoded_signature)):
        raise HTTPException(status_code=401, detail="Invalid token signature.")

    payload = json.loads(b64url_decode(encoded_payload))
    exp = payload.get("exp")
    if exp is None or int(exp) < int(now_utc().timestamp()):
        raise HTTPException(status_code=401, detail="Token expired.")
    return payload


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    )
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, stored_hash = password_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        int(iterations),
    )
    return hmac.compare_digest(digest.hex(), stored_hash)


def set_auth_cookie(response: Response, user: User) -> None:
    expires_at = now_utc() + timedelta(hours=JWT_EXPIRES_HOURS)
    token = sign_jwt(
        {
            "sub": user.id,
            "email": user.email,
            "exp": int(expires_at.timestamp()),
        }
    )
    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=JWT_EXPIRES_HOURS * 3600,
        expires=JWT_EXPIRES_HOURS * 3600,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=JWT_COOKIE_NAME, path="/")


async def get_current_user(
    token: str | None = Cookie(default=None, alias=JWT_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    payload = decode_jwt(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    user = await db.get(User, user_id)
    if user is None or not user.email or not user.password_hash or not user.is_verified:
        raise HTTPException(status_code=401, detail="User not available.")
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_relation_status(db: AsyncSession, current_user_id: str, target_id: str) -> str:
    result = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.sender_id == current_user_id, FriendRequest.receiver_id == target_id),
                and_(FriendRequest.sender_id == target_id, FriendRequest.receiver_id == current_user_id),
            )
        )
    )
    requests = result.scalars().all()

    for req in requests:
        if req.status == "accepted":
            return "friends"
        if req.status == "pending":
            return "requested" if req.sender_id == current_user_id else "pending_incoming"
        if req.status == "rejected":
            return "rejected"
    return "none"


async def send_presence_snapshot(websocket: WebSocket) -> None:
    await websocket.send_json({"type": "presence-snapshot", "online": list(active_connections.keys())})


async def broadcast_presence(client_id: str, status_value: str) -> None:
    payload = {"type": "presence", "clientId": client_id, "status": status_value}
    disconnected: list[str] = []
    for connection_id, socket in active_connections.items():
        try:
            await socket.send_json(payload)
        except RuntimeError:
            disconnected.append(connection_id)

    for connection_id in disconnected:
        active_connections.pop(connection_id, None)


@app.post("/register")
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user and user.password_hash and user.is_verified:
        raise HTTPException(status_code=409, detail="Email is already registered.")

    otp = generate_otp()
    expires_at = now_utc() + timedelta(minutes=OTP_TTL_MINUTES)

    if user is None:
        user = User(
            id=await generate_unique_user_id(db, temporary=True),
            display_name="Anonymous",
            email=email,
            otp_code=otp,
            otp_expires_at=expires_at,
            is_verified=False,
        )
        db.add(user)
    else:
        user.display_name = "Anonymous"
        user.otp_code = otp
        user.otp_expires_at = expires_at
        user.is_verified = False

    await db.commit()

    try:
        await asyncio.to_thread(send_otp_email, email, otp)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send verification email: {exc}") from exc

    return {"message": "Verification code sent by email."}


@app.post("/verify")
async def verify(payload: VerifyRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None or not user.otp_code or not user.otp_expires_at:
        raise HTTPException(status_code=404, detail="Verification session not found.")

    if user.otp_expires_at < now_utc():
        raise HTTPException(status_code=400, detail="OTP expired.")

    if payload.otp.strip() != user.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user.is_verified = True
    await db.commit()
    return {"message": "Email verified."}


@app.post("/set-password")
async def set_password(payload: SetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="Email must be verified before setting a password.")

    user.password_hash = hash_password(payload.password)
    user.otp_code = None
    user.otp_expires_at = None
    if user.id.startswith("T"):
        user.id = await generate_unique_user_id(db)
    await db.commit()
    await db.refresh(user)
    return {"message": "Password set successfully.", "id": user.id}


@app.post("/set-name")
async def set_name(payload: SetNameRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="Email must be verified before setting a name.")
    
    user.display_name = f"{payload.first_name.strip()} {payload.last_name.strip()}"
    await db.commit()
    return {"message": "Name set successfully.", "id": user.id}


@app.post("/login")
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email is not verified.")

    set_auth_cookie(response, user)
    return {
        "message": "Login successful.",
        "user": {"id": user.id, "email": user.email, "is_public": user.is_public, "is_verified": user.is_verified, "avatar_url": get_avatar_url(user)},
    }


@app.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None or not user.password_hash or not user.is_verified:
        raise HTTPException(status_code=404, detail="No verified account found for this email.")

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = now_utc() + timedelta(minutes=OTP_TTL_MINUTES)
    await db.commit()

    try:
        await asyncio.to_thread(send_password_reset_otp_email, email, otp)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send reset email: {exc}") from exc

    return {"message": "Password reset code sent to your email."}


@app.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    email = validate_email(payload.email)
    user = await get_user_by_email(db, email)
    if user is None or not user.otp_code or not user.otp_expires_at:
        raise HTTPException(status_code=404, detail="No reset session found for this email.")
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="Account is not verified.")

    if user.otp_expires_at < now_utc():
        raise HTTPException(status_code=400, detail="Reset code expired. Please request a new one.")

    if payload.otp.strip() != user.otp_code:
        raise HTTPException(status_code=400, detail="Invalid reset code.")

    user.password_hash = hash_password(payload.new_password)
    user.otp_code = None
    user.otp_expires_at = None
    await db.commit()
    return {"message": "Password reset successfully. You can now log in with your new password."}


@app.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    clear_auth_cookie(response)
    return {"message": "Logged out."}


@app.get("/api/auth/me")
async def auth_me(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "user": {
            "id": current_user.id,
            "display_name": current_user.display_name,
            "email": current_user.email,
            "is_public": current_user.is_public,
            "is_verified": current_user.is_verified,
            "avatar_url": get_avatar_url(current_user),
        }
    }


@app.patch("/api/users/{user_id}/visibility")
async def update_visibility(
    user_id: str,
    payload: VisibilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | bool]:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user.")

    current_user.is_public = payload.is_public
    await db.commit()
    await db.refresh(current_user)
    return {"id": current_user.id, "is_public": current_user.is_public}


@app.get("/api/users/public")
async def list_public_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[dict[str, Any]]]:
    result = await db.execute(select(User).where(User.is_public.is_(True)).order_by(User.created_at.desc()))
    users = result.scalars().all()

    public_users = [
        {
            "id": user.id, 
            "display_name": user.display_name,
            "is_public": user.is_public, 
            "is_online": user.id in active_connections,
            "relation_status": await get_relation_status(db, current_user.id, user.id),
            "avatar_url": get_avatar_url(user),
        }
        for user in users
        if user.id != current_user.id and user.password_hash and user.is_verified
    ]
    return {"users": public_users}


@app.get("/api/users/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str | bool | None]:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == current_user.id:
        relation_status = "self"
    else:
        relation_status = await get_relation_status(db, current_user.id, user.id)
    return {
        "id": user.id,
        "display_name": user.display_name,
        "email": user.email,
        "is_public": user.is_public,
        "is_verified": user.is_verified,
        "is_online": user.id in active_connections,
        "relation_status": relation_status,
        "avatar_url": get_avatar_url(user),
    }


@app.get("/api/gifs/config")
async def gif_config() -> dict[str, bool]:
    return {"enabled": bool(GIPHY_API_KEY)}


@app.get("/api/gifs/search")
async def search_gifs(q: str = "", limit: int = 20, offset: int = 0) -> dict[str, Any]:
    if not GIPHY_API_KEY:
        raise HTTPException(status_code=503, detail="GIF search is not configured.")
    params = urllib.parse.urlencode({"api_key": GIPHY_API_KEY, "q": q, "limit": limit, "offset": offset, "rating": "g"})
    url = f"https://api.giphy.com/v1/gifs/search?{params}"
    data = await asyncio.to_thread(_fetch_json, url)
    return {"results": [{"id": g["id"], "url": g["images"]["fixed_height_small"]["url"], "preview": g["images"]["preview_gif"]["url"], "title": g.get("title", "")} for g in data.get("data", [])]}


@app.get("/api/gifs/trending")
async def trending_gifs(limit: int = 20, offset: int = 0) -> dict[str, Any]:
    if not GIPHY_API_KEY:
        raise HTTPException(status_code=503, detail="GIF search is not configured.")
    params = urllib.parse.urlencode({"api_key": GIPHY_API_KEY, "limit": limit, "offset": offset, "rating": "g"})
    url = f"https://api.giphy.com/v1/gifs/trending?{params}"
    data = await asyncio.to_thread(_fetch_json, url)
    return {"results": [{"id": g["id"], "url": g["images"]["fixed_height_small"]["url"], "preview": g["images"]["preview_gif"]["url"], "title": g.get("title", "")} for g in data.get("data", [])]}


def _fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


@app.post("/api/friends/request")
async def send_friend_request(
    payload: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    receiver_id = payload.receiver_id
    if receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself.")

    receiver = await db.get(User, receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found.")

    # Check for existing request in either direction
    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == receiver_id),
                and_(FriendRequest.sender_id == receiver_id, FriendRequest.receiver_id == current_user.id)
            )
        )
    )
    existing_req = existing.scalars().first()
    
    if existing_req:
        if existing_req.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends.")
        elif existing_req.status == "pending":
            raise HTTPException(status_code=409, detail="Friend request already pending.")
        elif existing_req.status == "rejected":
            # If it was rejected, we could allow resending by deleting the old one, but for simplicity let's just update it to pending if we are the new sender
            # Or if they rejected us, maybe don't allow? Let's just delete the old one and create new or update status
            existing_req.status = "pending"
            existing_req.sender_id = current_user.id
            existing_req.receiver_id = receiver_id
            await db.commit()
            
            # notify receiver
            receiver_socket = active_connections.get(receiver_id)
            if receiver_socket:
                await receiver_socket.send_json({"type": "friend-request", "from": current_user.id})
            
            return {"message": "Friend request sent."}

    new_req = FriendRequest(sender_id=current_user.id, receiver_id=receiver_id, status="pending")
    db.add(new_req)
    await db.commit()

    # notify receiver
    receiver_socket = active_connections.get(receiver_id)
    if receiver_socket:
        await receiver_socket.send_json({"type": "friend-request", "from": current_user.id})

    return {"message": "Friend request sent."}


@app.get("/api/friends/requests")
async def get_friend_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(FriendRequest).where(
            and_(FriendRequest.receiver_id == current_user.id, FriendRequest.status == "pending")
        ).order_by(FriendRequest.created_at.desc())
    )
    requests = result.scalars().all()
    request_items = []
    for r in requests:
        sender = await db.get(User, r.sender_id)
        request_items.append({
            "id": r.id,
            "sender_id": r.sender_id,
            "sender_display_name": sender.display_name if sender else r.sender_id,
            "sender_avatar_url": get_avatar_url(sender) if sender else f"https://api.dicebear.com/9.x/initials/svg?seed={r.sender_id}",
            "created_at": r.created_at,
        })
    return {"requests": request_items}


@app.patch("/api/friends/{request_id}/accept")
async def accept_friend_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = await db.get(FriendRequest, request_id)
    if not req or req.receiver_id != current_user.id:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")

    req.status = "accepted"
    await db.commit()

    # Optional: Notify sender that their request was accepted
    sender_socket = active_connections.get(req.sender_id)
    if sender_socket:
        await sender_socket.send_json({"type": "friend-accepted", "from": current_user.id})

    return {"message": "Friend request accepted."}


@app.patch("/api/friends/{request_id}/reject")
async def reject_friend_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = await db.get(FriendRequest, request_id)
    if not req or req.receiver_id != current_user.id:
        raise HTTPException(status_code=404, detail="Friend request not found.")
    
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")

    req.status = "rejected"
    await db.commit()
    return {"message": "Friend request rejected."}


@app.get("/api/friends")
async def get_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(FriendRequest).where(
            and_(
                or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id),
                FriendRequest.status == "accepted"
            )
        )
    )
    friends_reqs = result.scalars().all()
    friend_ids = [r.sender_id if r.receiver_id == current_user.id else r.receiver_id for r in friends_reqs]

    # Fetch full details for each friend
    friends_details = []
    for fid in friend_ids:
        user = await db.get(User, fid)
        if user:
            friends_details.append({
                "id": user.id,
                "display_name": user.display_name,
                "is_online": user.id in active_connections,
                "avatar_url": get_avatar_url(user),
            })

    return {"friends": friend_ids, "friends_details": friends_details}

@app.get("/api/nicknames")
async def get_nicknames(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict[str, dict[str, str]]:
    result = await db.execute(select(UserNickname).where(UserNickname.owner_id == current_user.id))
    nicknames = result.scalars().all()
    return {"nicknames": {n.target_user_id: n.nickname for n in nicknames}}


@app.post("/api/nickname/{target_id}")
async def set_nickname(
    target_id: str,
    payload: NicknameRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict[str, str]:
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot nickname yourself.")
    target = await db.get(User, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    result = await db.execute(
        select(UserNickname).where(
            and_(UserNickname.owner_id == current_user.id, UserNickname.target_user_id == target_id)
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.nickname = payload.nickname.strip()
    else:
        new_nick = UserNickname(
            owner_id=current_user.id,
            target_user_id=target_id,
            nickname=payload.nickname.strip()
        )
        db.add(new_nick)
    await db.commit()
    return {"message": "Nickname updated successfully."}


@app.delete("/api/nickname/{target_id}")
async def delete_nickname(
    target_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict[str, str]:
    result = await db.execute(
        select(UserNickname).where(
            and_(UserNickname.owner_id == current_user.id, UserNickname.target_user_id == target_id)
        )
    )
    existing = result.scalars().first()
    if existing:
        await db.delete(existing)
        await db.commit()
    return {"message": "Nickname removed."}


@app.post("/api/profile/upload")
async def upload_profile_image(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Upload a custom profile image. Max 2 MB, images only."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File size must be under 2 MB.")

    # Determine extension from content type
    ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}
    ext = ext_map.get(file.content_type, "jpg")
    timestamp = int(time.time() * 1000)
    filename = f"{current_user.id}_{timestamp}.{ext}"
    filepath = UPLOADS_DIR / filename

    # Delete old uploaded file if exists
    if current_user.profile_image_url and current_user.profile_image_url.startswith("/static/uploads/"):
        old_path = STATIC_DIR.parent / current_user.profile_image_url.lstrip("/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    # Write new file
    with open(filepath, "wb") as f:
        f.write(contents)

    current_user.profile_image_url = f"/static/uploads/{filename}"
    await db.commit()
    await db.refresh(current_user)
    return {"message": "Profile image uploaded.", "avatar_url": get_avatar_url(current_user)}


@app.delete("/api/profile/image")
async def remove_profile_image(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Remove the custom profile image and revert to auto-generated avatar."""
    if current_user.profile_image_url and current_user.profile_image_url.startswith("/static/uploads/"):
        old_path = STATIC_DIR.parent / current_user.profile_image_url.lstrip("/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    current_user.profile_image_url = None
    await db.commit()
    await db.refresh(current_user)
    return {"message": "Profile image removed.", "avatar_url": get_avatar_url(current_user)}


@app.websocket("/ws/{client_id}")
async def websocket_signaling(websocket: WebSocket, client_id: str) -> None:
    token = websocket.cookies.get(JWT_COOKIE_NAME)
    if token is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_jwt(token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if payload.get("sub") != client_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    active_connections[client_id] = websocket
    await send_presence_snapshot(websocket)
    await broadcast_presence(client_id, "connected")

    try:
        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            target_id = payload.get("target")
            event_type = payload.get("type")

            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if not target_id:
                await websocket.send_json({"type": "error", "message": "Missing target client ID."})
                continue

            target_socket = active_connections.get(target_id)
            if target_socket is None:
                await websocket.send_json(
                    {
                        "type": "peer-unavailable",
                        "target": target_id,
                        "message": "Peer is offline or unavailable.",
                    }
                )
                continue

            await target_socket.send_json(
                {
                    "type": event_type,
                    "from": client_id,
                    "target": target_id,
                    "payload": payload.get("payload", {}),
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.pop(client_id, None)
        await broadcast_presence(client_id, "disconnected")
