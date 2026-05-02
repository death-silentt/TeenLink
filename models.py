from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(6), primary_key=True, index=True)
    display_name: Mapped[str] = mapped_column(String(50), default="Anonymous", nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    otp_code: Mapped[str | None] = mapped_column(String(6), nullable=True)
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    profile_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    sender_id: Mapped[str] = mapped_column(String(6), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    receiver_id: Mapped[str] = mapped_column(String(6), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False) # pending, accepted, rejected
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("sender_id", "receiver_id", name="uq_friend_request_sender_receiver"),
    )


class UserNickname(Base):
    __tablename__ = "user_nicknames"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(String(6), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    target_user_id: Mapped[str] = mapped_column(String(6), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("owner_id", "target_user_id", name="uq_nickname_owner_target"),
    )
