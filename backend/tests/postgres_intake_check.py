"""Run ONLY inside the disposable aiqms-intake-tests container/network."""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

os.environ["DATABASE_URL"] = "postgresql+psycopg://postgres:disposable-test-only@aiqms-intake-postgres:5432/postgres"
os.environ["SECRET_KEY"] = "disposable-test-signing-key"

from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import text, select, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import Base, engine
from app.models import Counter, Institution, Token, TokenStatus
from app.services import queue_service, token_service

cfg = Config("/workspace/alembic.ini")
cfg.set_main_option("script_location", "/workspace/migrations")
command.upgrade(cfg, "fa2b9b2dc743")
with engine.begin() as conn:
    conn.execute(text("INSERT INTO institutions (id,name,type,is_active,created_at) VALUES (1,'Disposable hospital','hospital',true,now())"))
    conn.execute(text("INSERT INTO counters (id,institution_id,name,is_active,created_at) VALUES (1,1,'Desk',true,now())"))
    conn.execute(text("INSERT INTO tokens (institution_id,counter_id,token_number,status,issued_at) VALUES (1,1,'DES-0001','WAITING',now())"))
command.upgrade(cfg, "head")
with Session(engine) as db:
    legacy = db.scalars(select(Token)).one()
    assert legacy.customer_cnic is None and legacy.referral_source is None
    assert legacy.requested_priority == legacy.effective_priority == "normal"
    first_id = legacy.id
    later, _ = token_service.issue_token(db, institution_id=1, counter_id=1, customer_name=None,
        customer_cnic="0000000000001", referral_source="website", requested_priority="accessibility", priority_reason="elderly")
    later_id = later.id
    assert later.customer_cnic == "0000000000001"

# Compare actual PostgreSQL DDL from the migration with ORM create_all.
with engine.begin() as conn:
    conn.execute(text("CREATE SCHEMA orm_check"))
    Base.metadata.create_all(conn.execution_options(schema_translate_map={None: "orm_check"}))
inspector = inspect(engine)
assert inspector.get_check_constraints("tokens") == inspector.get_check_constraints("tokens", schema="orm_check")
intake_columns = {"customer_cnic", "referral_source", "referral_organization", "requested_priority",
                  "effective_priority", "priority_reason", "priority_review", "priority_reviewed_by", "priority_reviewed_at"}
def column_contract(schema):
    return {c["name"]: (str(c["type"]), c["nullable"], c["default"])
            for c in inspector.get_columns("tokens", schema=schema) if c["name"] in intake_columns}
assert column_contract("public") == column_contract("orm_check")
for schema in ("public", "orm_check"):
    if schema == "orm_check":
        with Session(engine.execution_options(schema_translate_map={None: "orm_check"})) as db:
            db.add(Institution(id=1, name="ORM hospital", type="hospital"))
            db.flush()
            db.add(Counter(id=1, institution_id=1, name="Desk"))
            db.flush()
            db.add(Token(institution_id=1, counter_id=1, token_number="DES-0001"))
            db.commit()
    for assignment in (
        "customer_cnic='123'", "customer_cnic='１２３４５６７８９０１２３'",
        "referral_source='invalid'", "referral_source='other'",
        "referral_source='other', referral_organization='   '",
        "referral_source=NULL, referral_organization='Unexpected'",
        "requested_priority='urgent'", "effective_priority='urgent'",
        "requested_priority='accessibility', priority_reason=NULL",
        "priority_reason='disability'", "priority_review='invalid'",
        "effective_priority='accessibility'",
    ):
        try:
            with engine.begin() as conn:
                conn.execute(text(f"UPDATE {schema}.tokens SET {assignment} WHERE id=1"))
        except IntegrityError:
            pass
        else:
            raise AssertionError("Invalid intake accepted")


def race(ids):
    barrier = Barrier(2)
    def call(id):
        with Session(engine) as db:
            token = db.get(Token, id)
            barrier.wait(timeout=10)
            try:
                queue_service.call_token(db, token)
                return 200
            except HTTPException as error:
                db.rollback()
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        return sorted(pool.map(call, ids))


assert race([first_id, later_id]) == [200, 409]
with Session(engine) as db:
    active = db.get(Token, first_id)
    queue_service.mark_no_show(db, active)
assert race([later_id, later_id]) == [200, 409]
with Session(engine) as db:
    assert len(db.scalars(select(Token).where(Token.status == TokenStatus.CALLED)).all()) == 1

barrier = Barrier(8)
def issue(_):
    with Session(engine) as db:
        barrier.wait(timeout=10)
        token, _ = token_service.issue_token(db, institution_id=1, counter_id=1, customer_name=None)
        return token.token_number
with ThreadPoolExecutor(max_workers=8) as pool:
    numbers = list(pool.map(issue, range(8)))
assert len(set(numbers)) == 8
assert set(numbers) == {f"DES-{i:04d}" for i in range(3, 11)}
command.downgrade(cfg, "fa2b9b2dc743")
command.upgrade(cfg, "head")
with Session(engine) as db:
    rows = db.scalars(select(Token)).all()
    assert len(rows) == 10
    assert all(t.requested_priority == t.effective_priority == "normal" and t.priority_review == "not_requested" for t in rows)
print("PostgreSQL migration/ORM constraint parity, invalid intake, backfill/round-trip, concurrent issuance and dispatch passed; disposable DB only.")
