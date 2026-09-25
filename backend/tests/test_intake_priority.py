"""Private intake, priority authorization and canonical dispatch regression tests."""
import os
import re
import unittest
import json
from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "isolated-test-not-for-deployment"

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.api.deps import get_current_user
from app.api.v1 import bot, public, tokens
from app.config import settings
from app.database import Base, get_db
from app.models import Counter, Institution, Personnel, Token, TokenStatus
from app.services import queue_service, token_service
from app.utils.rate_limit import SlidingWindowLimiter
from app.main import private_validation_error, private_database_error
from sqlalchemy.exc import SQLAlchemyError


class IntakePriorityTests(unittest.TestCase):
    def test_shared_bot_contract_matches_real_schemas(self):
        contract = json.loads(Path(__file__).with_name("bot_intake_contract.json").read_text())
        profile = bot.ProfileAvailable.model_validate(contract["profile"])
        reuse = bot.ReuseIntake.model_validate(contract["reuse"])
        bot.PublicTicketOut.model_validate(contract["ticket"])
        self.assertEqual(reuse.profile_ref, profile.profile_ref)
        self.assertTrue(reuse.confirm_same_person)
        from pydantic import ValidationError
        for invalid in (None, "73", True, 0):
            with self.assertRaises(ValidationError):
                bot.ReuseIntake.model_validate({**contract["reuse"], "profile_ref": invalid})

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        @event.listens_for(self.engine, "connect")
        def regexp(connection, _):
            connection.create_function("regexp_replace", 4, lambda value, pattern, replacement, flags:
                                       re.sub(pattern, replacement, value) if value else None)
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(patch.stopall)
        patch.object(settings, "INTERNAL_API_KEY", "intake-test-key").start()
        patch.object(public, "public_issue_limiter", SlidingWindowLimiter(1000, 60)).start()
        self.broadcast = patch.object(tokens, "broadcast_queue", new_callable=AsyncMock).start()
        with Session(self.engine) as db:
            db.add_all([Institution(id=1, name="Hospital", type="hospital"), Institution(id=2, name="Bank", type="bank")])
            db.add_all([Counter(id=1, institution_id=1, name="Desk"), Counter(id=2, institution_id=2, name="Desk")])
            db.commit()
        self.user = SimpleNamespace(id=1, institution_id=1, role="admin")
        app = FastAPI()
        app.add_exception_handler(RequestValidationError, private_validation_error)
        app.add_exception_handler(SQLAlchemyError, private_database_error)
        for router in (tokens.router, public.router, bot.router):
            app.include_router(router)
        def database():
            with Session(self.engine) as db:
                yield db
        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def issue(self, **changes):
        return self.client.post("/public/tokens", json={"institution_id": 1, "counter_id": 1,
            "customer_cnic": "0000000000001", "referral_source": "website",
            "customer_phone": "+15551234567", **changes})

    def review(self, id, decision="approve"):
        return self.client.post(f"/tokens/{id}/priority", json={"decision": decision})

    def test_strict_cnic_and_required_public_intake(self):
        for value in (None, 1234567890123, "123", "12345678901234", "１２３４５６７８９０１２３", "00000-0000000-1", "0000000000001\n"):
            self.assertEqual(self.issue(customer_cnic=value).status_code, 422)
        self.assertEqual(self.issue(referral_source=None).status_code, 422)
        self.assertEqual(self.issue(referral_source="other", referral_organization="  ").status_code, 422)
        self.assertEqual(self.issue().status_code, 201)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(Token.customer_cnic)), "0000000000001")
        self.assertEqual(self.client.post("/tokens", json={"counter_id": 1}).status_code, 201)
        self.assertEqual(self.client.post("/tokens", json={"counter_id": 1, "customer_cnic": "bad"}).status_code, 422)

    def test_no_private_intake_in_any_ticket_or_snapshot(self):
        response = self.issue(referral_source="other", referral_organization="Dummy organization")
        self.assertEqual(response.status_code, 201)
        with Session(self.engine) as db:
            token = db.get(Token, 1)
            views = [response.json(), token_service.build_public_ticket(db, token).model_dump(),
                     queue_service.token_out(db, token).model_dump(), queue_service.snapshot(db, 1).model_dump()]
        for view in views:
            text = str(view)
            for private in ("customer_cnic", "0000000000001", "referral_source", "Dummy organization"):
                self.assertNotIn(private, text)

    def test_pending_normal_then_approved_order_and_fifo_tie(self):
        self.issue()
        self.issue(requested_priority="accessibility", priority_reason="elderly")
        self.issue(requested_priority="accessibility", priority_reason="disability")
        with Session(self.engine) as db:
            for token in db.scalars(select(Token)):
                token.issued_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
            db.commit()
            self.assertEqual([t.id for t in queue_service.snapshot(db, 1).counters[0].tokens], [1, 2, 3])
        self.assertEqual(self.review(3).status_code, 200)
        self.assertEqual(self.review(2).status_code, 200)
        self.broadcast.assert_awaited()
        with Session(self.engine) as db:
            ordered = queue_service.snapshot(db, 1).counters[0].tokens
            self.assertEqual([t.id for t in ordered], [2, 3, 1])
            for position, out in enumerate(ordered, 1):
                token = db.get(Token, out.id)
                self.assertEqual(token_service.build_public_ticket(db, token).position, position)
                self.assertEqual(queue_service.token_out(db, token).position, position)
                self.assertEqual(token_service.build_public_ticket(db, token).estimated_wait_min, out.eta_min)

    def test_dispatch_rejects_skipping_and_never_preempts(self):
        self.issue()
        self.issue(requested_priority="accessibility", priority_reason="elderly")
        self.assertEqual(self.client.post("/tokens/2/call").status_code, 409)
        self.assertEqual(self.client.post("/tokens/1/call").status_code, 200)
        self.assertEqual(self.review(2).status_code, 200)
        self.assertEqual(self.review(1).status_code, 409)
        self.assertEqual(self.client.post("/tokens/2/call").status_code, 409)
        self.assertEqual(self.client.post("/tokens/1/start").status_code, 200)
        self.assertEqual(self.client.post("/tokens/2/call").status_code, 409)
        self.assertEqual(self.client.post("/tokens/1/complete").status_code, 200)
        self.assertEqual(self.client.post("/tokens/2/call").status_code, 200)

    def test_reject_and_return_normal_restore_fifo(self):
        self.issue()
        self.issue(requested_priority="accessibility", priority_reason="disability")
        for decision in ("reject", "normal"):
            self.assertEqual(self.review(2).json()["effective_priority"], "accessibility")
            out = self.review(2, decision).json()
            self.assertEqual(out["effective_priority"], "normal")
            self.assertEqual(out["position"], 2)

    def test_role_tenant_hospital_and_waiting_guards(self):
        self.issue(requested_priority="accessibility", priority_reason="elderly")
        self.user.institution_id = 2
        self.assertEqual(self.review(1).status_code, 404)
        self.assertEqual(self.issue(institution_id=2, counter_id=2, requested_priority="accessibility", priority_reason="elderly").status_code, 422)
        self.user.institution_id = 1
        self.user.role = "staff"
        self.assertEqual(self.review(1).status_code, 403)
        with Session(self.engine) as db:
            db.add(Personnel(id=1, institution_id=1, user_id=1, name="Staff", is_active=True))
            db.commit()
        self.assertEqual(self.review(1).status_code, 200)
        with Session(self.engine) as db:
            db.get(Personnel, 1).is_active = False
            db.commit()
        self.assertEqual(self.review(1).status_code, 403)

    def test_profile_is_internal_scoped_and_reuse_requires_confirmation(self):
        self.issue()
        payload = {"phone": "15551234567", "institution_id": 1}
        headers = {"X-Internal-API-Key": "intake-test-key"}
        self.assertEqual(self.client.post("/internal/bot/profile", json=payload).status_code, 401)
        self.assertEqual(self.client.post("/internal/bot/profile", json=payload, headers=headers).json(), {"available": True, "profile_ref": 1})
        for changes in ({"institution_id": 2}, {"phone": "15557654321"}):
            self.assertEqual(self.client.post("/internal/bot/profile", json={**payload, **changes}, headers=headers).json(), {"available": False, "profile_ref": None})
        reuse = {**payload, "counter_id": 1, "confirm_same_person": False, "profile_ref": 1}
        self.assertEqual(self.client.post("/internal/bot/tokens/reuse", json=reuse, headers=headers).status_code, 422)
        reuse["confirm_same_person"] = True
        response = self.client.post("/internal/bot/tokens/reuse", json=reuse, headers=headers)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertNotIn("customer_cnic", response.json())
        with Session(self.engine) as db:
            self.assertEqual(db.get(Token, 2).customer_cnic, "0000000000001")

    def test_reuse_is_bound_to_confirmed_record_not_latest_profile(self):
        self.issue(referral_source="other", referral_organization="Original organization")
        self.issue(customer_cnic="0000000000002", referral_source="institution")
        headers = {"X-Internal-API-Key": "intake-test-key"}
        payload = {"phone": "15551234567", "institution_id": 1, "counter_id": 1,
                   "confirm_same_person": True, "profile_ref": 1}
        self.assertEqual(self.client.post("/internal/bot/profile", json=payload, headers=headers).json()["profile_ref"], 2)
        missing = {k: v for k, v in payload.items() if k != "profile_ref"}
        self.assertEqual(self.client.post("/internal/bot/tokens/reuse", json=missing, headers=headers).status_code, 422)
        self.assertEqual(self.client.post("/internal/bot/tokens/reuse", json=payload).status_code, 401)
        for changes in ({"phone": "15557654321"}, {"institution_id": 2, "counter_id": 2}, {"profile_ref": 999}):
            self.assertEqual(self.client.post("/internal/bot/tokens/reuse", json={**payload, **changes}, headers=headers).status_code, 409)
        response = self.client.post("/internal/bot/tokens/reuse", json=payload, headers=headers)
        self.assertEqual(response.status_code, 201, response.text)
        with Session(self.engine) as db:
            copied = db.get(Token, 3)
            self.assertEqual((copied.customer_cnic, copied.referral_source, copied.referral_organization),
                             ("0000000000001", "other", "Original organization"))
            db.get(Institution, 1).is_active = False
            db.commit()
        self.assertEqual(self.client.post("/internal/bot/tokens/reuse", json=payload, headers=headers).status_code, 409)

    def test_public_priority_is_safe_and_broadcast_failure_keeps_success(self):
        response = self.issue(requested_priority="accessibility", priority_reason="disability")
        self.assertEqual(response.json()["priority_review"], "pending")
        self.assertEqual(response.json()["effective_priority"], "normal")
        self.broadcast.side_effect = RuntimeError("private broadcast failure")
        self.assertEqual(self.review(1).status_code, 200)
        ticket = self.client.get("/public/tokens/DES-0001?institution_id=1").json()
        self.assertEqual(ticket["effective_priority"], "accessibility")
        self.assertEqual(ticket["requested_priority"], "accessibility")
        self.assertEqual(ticket["priority_review"], "approved")
        self.assertNotIn("disability", str(ticket))
        self.assertNotIn("priority_reason", ticket)
        for view in (self.client.get("/tokens").json(), ticket):
            self.assertNotIn("0000000000001", str(view))
            self.assertNotIn("referral_source", str(view))
        lookup = self.client.post("/internal/bot/tokens/lookup", json={"phone": "15551234567"},
                                  headers={"X-Internal-API-Key": "intake-test-key"})
        self.assertEqual(lookup.status_code, 200)
        for private in ("0000000000001", "disability", "priority_reason", "referral_source"):
            self.assertNotIn(private, lookup.text)

    def test_review_rejects_bank_terminal_and_unrequested_approval(self):
        self.issue()
        self.assertEqual(self.review(1).status_code, 409)
        self.issue(requested_priority="accessibility", priority_reason="elderly")
        self.assertEqual(self.client.post("/tokens/2/no-show").status_code, 200)
        self.assertEqual(self.review(2).status_code, 409)
        self.issue(institution_id=2, counter_id=2)
        self.user.institution_id = 2
        self.assertEqual(self.review(3, "normal").status_code, 403)

    def test_validation_and_database_errors_do_not_echo_private_input(self):
        for changes in ({"counter_id": "bad"}, {"customer_cnic": "0000000000001x"},
                        {"referral_source": "other", "referral_organization": " "},
                        {"requested_priority": "accessibility"}):
            response = self.issue(**changes)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn("0000000000001", response.text)
            self.assertNotIn('"input"', response.text)
            self.assertNotIn('"ctx"', response.text)
        with patch.object(token_service, "issue_token", side_effect=SQLAlchemyError("0000000000001 private organization")):
            with self.assertLogs("app.main", level="ERROR") as logs:
                response = self.issue()
            self.assertEqual(response.status_code, 500)
            self.assertNotIn("0000000000001", response.text + str(logs.output))
            self.assertNotIn("private organization", response.text + str(logs.output))

    def test_issuance_number_survives_gaps(self):
        for _ in range(3):
            self.assertEqual(self.issue().status_code, 201)
        with Session(self.engine) as db:
            db.delete(db.get(Token, 2))
            db.commit()
        self.assertEqual(self.issue().json()["token_number"], "DES-0004")


if __name__ == "__main__":
    unittest.main()
