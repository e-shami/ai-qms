"""Live staff-presence roster.

Presence is *declared* (work_status) while serving state is derived from
tokens stamped with served_by_personnel_id — so the roster never claims
someone is busy unless a real token says so.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Personnel, Token, TokenStatus
from app.schemas.staff import PresenceEntry

_SERVING_STATUSES = (TokenStatus.IN_SERVICE, TokenStatus.CALLED)


def roster(db: Session, institution_id: int) -> list[PresenceEntry]:
    members = (
        db.execute(
            select(Personnel)
            .where(
                Personnel.institution_id == institution_id,
                Personnel.is_active.is_(True),
            )
            .order_by(Personnel.name, Personnel.id)
        )
        .scalars()
        .all()
    )

    serving: dict[int, Token] = {}
    if members:
        active_tokens = (
            db.execute(
                select(Token)
                .where(
                    Token.institution_id == institution_id,
                    Token.served_by_personnel_id.isnot(None),
                    Token.status.in_(_SERVING_STATUSES),
                )
                .order_by(Token.called_at.desc(), Token.id.desc())
            )
            .scalars()
            .all()
        )
        for token in active_tokens:
            owner = token.served_by_personnel_id
            if owner not in serving or token.status == TokenStatus.IN_SERVICE:
                serving[owner] = token

    entries: list[PresenceEntry] = []
    for member in members:
        token = serving.get(member.id)
        entries.append(
            PresenceEntry(
                personnel_id=member.id,
                name=member.name,
                title=member.title,
                work_status=member.work_status,
                counter_id=member.counter_id,
                serving_token_number=token.token_number if token else None,
                serving_token_status=token.status if token else None,
            )
        )
    return entries
