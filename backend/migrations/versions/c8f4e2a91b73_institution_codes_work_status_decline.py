"""institution codes, personnel work status, token decline fields

Adds the public institution short code (derived from the name plus a
zero-padded primary key and therefore collision-free), the declared
staff presence field, and the decline-with-reason support on tokens
including who served/called them.

Revision ID: c8f4e2a91b73
Revises: b3c1f2a7d9e4
Create Date: 2026-08-24 00:00:00.000000

The code-derivation helper below deliberately duplicates
app.utils.institution_code instead of importing it: data migrations must
keep producing identical codes even if the application helper is later
refactored.

`code` stays nullable at the schema level on purpose: it is derived from
the row's own primary key, so it can only be filled in the statement
after INSERT. The register flow writes it before commit, and the UNIQUE
index plus a backfill here keep every persisted row covered.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8f4e2a91b73'
down_revision: Union[str, None] = 'b3c1f2a7d9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _derive_code(institution_id: int, name: str | None) -> str:
    words: list[str] = []
    for raw in (name or "").split():
        cleaned = "".join(ch for ch in raw.upper() if ch.isascii() and ch.isalnum())
        if cleaned:
            words.append(cleaned)

    picked: list[str] = []
    offsets = [0] * len(words)
    for index, word in enumerate(words):
        initial = next((ch for ch in word if ch.isalpha()), None)
        if initial is None:
            continue
        picked.append(initial)
        offsets[index] = 1
        if len(picked) == 3:
            break

    while len(picked) < 3:
        progressed = False
        for index, word in enumerate(words):
            if offsets[index] < len(word) and word[offsets[index]].isalpha():
                picked.append(word[offsets[index]])
                offsets[index] += 1
                progressed = True
                if len(picked) == 3:
                    break
        if not progressed:
            break

    prefix = "".join(picked).ljust(3, "X") if picked else "QMS"
    return f"{prefix}{institution_id:03d}"


def upgrade() -> None:
    op.add_column('institutions', sa.Column('code', sa.String(length=8), nullable=True))

    bind = op.get_bind()
    institutions = sa.table(
        'institutions',
        sa.column('id', sa.Integer),
        sa.column('name', sa.String),
        sa.column('code', sa.String),
    )
    for row in bind.execute(sa.select(institutions.c.id, institutions.c.name)).all():
        bind.execute(
            institutions.update()
            .where(institutions.c.id == row.id)
            .values(code=_derive_code(row.id, row.name))
        )

    op.alter_column('institutions', 'code', existing_type=sa.String(length=8), nullable=True)
    op.create_index('ix_institutions_code', 'institutions', ['code'], unique=True)

    op.add_column(
        'personnel',
        sa.Column(
            'work_status',
            sa.String(length=32),
            nullable=False,
            server_default='off_duty',
        ),
    )

    op.add_column('tokens', sa.Column('decline_reason', sa.String(length=255), nullable=True))
    op.add_column(
        'tokens',
        sa.Column(
            'served_by_personnel_id',
            sa.Integer(),
            sa.ForeignKey('personnel.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )

    if bind.dialect.name == 'postgresql':
        # SQLAlchemy persists this enum by member NAME, so the new label
        # is uppercase to match the existing WAITING/CALLED/... labels.
        op.execute("ALTER TYPE token_status ADD VALUE IF NOT EXISTS 'DECLINED'")


def downgrade() -> None:
    op.drop_column('tokens', 'served_by_personnel_id')
    op.drop_column('tokens', 'decline_reason')
    op.drop_column('personnel', 'work_status')
    op.drop_index('ix_institutions_code', table_name='institutions')
    op.drop_column('institutions', 'code')
    # Postgres cannot remove an enum value without rebuilding the type;
    # 'declined' is left in place and simply goes unused.
