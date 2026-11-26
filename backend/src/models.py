"""SQLAlchemy models mirrored by the D1 tables."""

from sqlalchemy import Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    host_token: Mapped[str] = mapped_column(String, unique=True)
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)
    card_set: Mapped[str] = mapped_column(String)
    revealed: Mapped[int] = mapped_column(Integer, default=0)
    active_issue_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (Index("idx_participants_room", "room_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    room_id: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    token: Mapped[str] = mapped_column(String, unique=True)
    is_spectator: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (Index("idx_issues_room", "room_id", "position", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    room_id: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    link: Mapped[str] = mapped_column(String, default="")
    position: Mapped[int] = mapped_column(Integer)
    estimate: Mapped[str | None] = mapped_column(String, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String)


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("issue_id", "participant_id", name="idx_votes_issue_participant"),
        Index("idx_votes_room", "room_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    room_id: Mapped[str] = mapped_column(String)
    issue_id: Mapped[str] = mapped_column(String)
    participant_id: Mapped[str] = mapped_column(String)
    value: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
