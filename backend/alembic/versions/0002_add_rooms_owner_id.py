"""add rooms.owner_id

Adds the column that records which participant currently owns the room,
enabling host-role transfer.

Revision ID: 0002_add_rooms_owner_id
Revises: 0001_initial_schema
Create Date: 2026-07-30

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_add_rooms_owner_id"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("rooms", schema=None) as batch_op:
        batch_op.drop_column("owner_id")
