"""Add CV fields to Counter model

Revision ID: fa2b9b2dc743
Revises: 797b3c152fb7
Create Date: 2026-09-01 18:38:49.641468

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fa2b9b2dc743'
down_revision: Union[str, None] = '797b3c152fb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('counters', sa.Column('cv_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('counters', sa.Column('cv_queue_length', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('counters', sa.Column('cv_service_rate', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('counters', sa.Column('cv_estimated_wait_min', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('counters', sa.Column('cv_last_update', sa.DateTime(timezone=True), nullable=True))
    op.add_column('counters', sa.Column('camera_url', sa.String(512), nullable=True))
    op.add_column('counters', sa.Column('roi_polygon', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('counters', 'roi_polygon')
    op.drop_column('counters', 'camera_url')
    op.drop_column('counters', 'cv_last_update')
    op.drop_column('counters', 'cv_estimated_wait_min')
    op.drop_column('counters', 'cv_service_rate')
    op.drop_column('counters', 'cv_queue_length')
    op.drop_column('counters', 'cv_enabled')