"""Append-only event log per job, used to render the live deployment feed.

Revision ID: 004
Revises: 003
Create Date: 2026-04-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.Text(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("event_type", sa.Text(), nullable=False, server_default="log"),
        sa.Column("level", sa.Text(), nullable=False, server_default="info"),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["job_id"], ["job_history.job_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_job_events_job_seq", "job_events", ["job_id", "seq"])
    op.create_index("idx_job_events_job", "job_events", ["job_id"])


def downgrade() -> None:
    op.drop_index("idx_job_events_job", table_name="job_events")
    op.drop_index("idx_job_events_job_seq", table_name="job_events")
    op.drop_table("job_events")
