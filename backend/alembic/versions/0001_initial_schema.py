"""initial schema

This baseline captures the schema as it existed before Alembic was
introduced. Existing databases (created earlier via metadata.create_all)
are auto-stamped to this revision on startup, so its upgrade() only runs
on brand-new databases.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-07-30

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("host_token", sa.String(length=255), nullable=False),
        sa.Column("card_set", sa.JSON(), nullable=False),
        sa.Column("revealed", sa.Boolean(), nullable=False),
        sa.Column("active_issue_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("host_token"),
    )
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_rooms_code"), ["code"], unique=True)

    op.create_table(
        "issues",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("link", sa.String(length=2048), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("estimate", sa.String(length=64), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("issues", schema=None) as batch_op:
        batch_op.create_index("issues_room_id_position_idx", ["room_id", "position"], unique=False)

    op.create_table(
        "participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("is_spectator", sa.Boolean(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    with op.batch_alter_table("participants", schema=None) as batch_op:
        batch_op.create_index("participants_room_id_idx", ["room_id"], unique=False)

    op.create_table(
        "votes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("issue_id", sa.String(length=36), nullable=False),
        sa.Column("participant_id", sa.String(length=36), nullable=False),
        sa.Column("value", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["issue_id"], ["issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("issue_id", "participant_id", name="uq_votes_issue_participant"),
    )
    with op.batch_alter_table("votes", schema=None) as batch_op:
        batch_op.create_index("votes_room_id_idx", ["room_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("votes", schema=None) as batch_op:
        batch_op.drop_index("votes_room_id_idx")
    op.drop_table("votes")

    with op.batch_alter_table("participants", schema=None) as batch_op:
        batch_op.drop_index("participants_room_id_idx")
    op.drop_table("participants")

    with op.batch_alter_table("issues", schema=None) as batch_op:
        batch_op.drop_index("issues_room_id_position_idx")
    op.drop_table("issues")

    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_rooms_code"))
    op.drop_table("rooms")
