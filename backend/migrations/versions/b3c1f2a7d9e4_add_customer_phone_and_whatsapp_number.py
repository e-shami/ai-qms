"""add customer_phone to tokens, whatsapp_number to institutions

Revision ID: b3c1f2a7d9e4
Revises: adf74866a5d4
Create Date: 2026-08-21 10:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c1f2a7d9e4'
down_revision: Union[str, None] = 'adf74866a5d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tokens',
        sa.Column('customer_phone', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'institutions',
        sa.Column('whatsapp_number', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('institutions', 'whatsapp_number')
    op.drop_column('tokens', 'customer_phone')
