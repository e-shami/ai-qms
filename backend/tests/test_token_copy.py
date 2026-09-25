"""SQLite-only API tests with fake configuration and every Meta call mocked."""
import io
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-only-not-a-deployment-key"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.v1 import public, tokens
from app.database import Base, get_db
from app.models import Counter, Institution, Token
from app.utils.rate_limit import SlidingWindowLimiter


class TokenCopyTests(unittest.TestCase):
    def setUp(self):
        self.config = SimpleNamespace(
            WHATSAPP_TOKEN="fake-test-token", PHONE_NUMBER_ID="123",
            WHATSAPP_API_VERSION="v23.0", WHATSAPP_COPY_TEMPLATE="test_copy",
            WHATSAPP_COPY_LANGUAGE="en_US", WHATSAPP_BOT_NUMBER="+15555550123",
        )
        self.addCleanup(patch.stopall)
        patch("app.services.token_copy.settings", self.config).start()
        self.send = patch("app.services.token_copy.urlopen").start()
        self.send.return_value.__enter__.return_value = io.StringIO('{"messages":[{"id":"test-message"}]}')
        patch.object(public, "public_issue_limiter", SlidingWindowLimiter(10, 60)).start()
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        with Session(self.engine) as db:
            db.add(Institution(id=1, name="Test", is_active=True))
            db.add(Counter(id=1, institution_id=1, name="General"))
            db.commit()
        app = FastAPI()
        app.include_router(tokens.router)
        app.include_router(public.router)

        def database():
            with Session(self.engine) as db:
                yield db

        self.user = SimpleNamespace(id=1, institution_id=1, role="admin")
        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.app = app
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def issue(self, public_flow=False, **overrides):
        payload = {"counter_id": 1, "customer_phone": "+1 (555) 555-0123", "whatsapp_copy": True, **overrides}
        if public_flow:
            payload["institution_id"] = 1
            payload.setdefault("customer_cnic", "0000000000001")
            payload.setdefault("referral_source", "website")
        return self.client.post("/public/tokens" if public_flow else "/tokens", json=payload)

    def assert_issued(self, response, status):
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["notification"]["status"], status)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count(Token.id))), 1)
            self.assertEqual(db.scalar(select(Token.customer_phone)), "+15555550123")

    def test_no_consent_never_sends(self):
        for public_flow in (False, True):
            response = self.issue(public_flow, whatsapp_copy=False)
            self.assertEqual(response.json()["notification"]["status"], "not_requested")
        self.send.assert_not_called()

    def test_omitted_consent_defaults_to_no_copy(self):
        response = self.client.post("/tokens", json={"counter_id": 1, "customer_phone": "+15555550123"})
        self.assert_issued(response, "not_requested")
        self.send.assert_not_called()

    def test_broadcast_failure_does_not_turn_committed_issuance_into_error(self):
        with patch.object(tokens, "broadcast_queue", side_effect=RuntimeError("test")):
            self.assert_issued(self.issue(), "accepted")
        with patch.object(public, "broadcast_queue", side_effect=RuntimeError("test")):
            self.assertEqual(self.issue(True).status_code, 201)

    def test_missing_configuration_keeps_token(self):
        self.config.WHATSAPP_COPY_TEMPLATE = ""
        self.assert_issued(self.issue(), "unavailable")
        self.send.assert_not_called()

    def test_template_success_is_acceptance_not_delivery(self):
        self.assert_issued(self.issue(template="attacker_template", text="arbitrary"), "accepted")
        request = self.send.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["type"], "template")
        self.assertEqual(payload["to"], "15555550123")
        self.assertEqual(payload["template"]["name"], "test_copy")
        self.assertEqual(payload["template"]["language"], {"code": "en_US"})
        self.assertEqual(payload["template"]["components"][0]["parameters"], [
            {"type": "text", "text": "GEN-0001"}, {"type": "text", "text": "General"},
        ])
        self.assertEqual(self.send.call_args.kwargs["timeout"], 8)
        self.send.assert_called_once()

    def test_meta_rejection_keeps_token(self):
        self.send.side_effect = HTTPError("https://example.invalid", 400, "rejected", {}, None)
        self.assert_issued(self.issue(), "failed")
        self.send.assert_called_once()

    def test_timeout_keeps_token_without_retry(self):
        self.send.side_effect = TimeoutError()
        self.assert_issued(self.issue(), "unknown")
        self.send.assert_called_once()

    def test_malformed_response_is_not_false_success(self):
        self.send.return_value.__enter__.return_value = io.StringIO('{"messages":[]}')
        self.assert_issued(self.issue(), "unknown")

    def test_public_only_returns_handoff_even_with_meta_config(self):
        response = self.issue(True)
        self.assert_issued(response, "action_required")
        self.assertEqual(response.json()["notification"]["action_url"], "https://wa.me/15555550123?text=status")
        self.assertNotIn("customer_phone", response.json())
        self.send.assert_not_called()

    def test_public_missing_bot_number(self):
        self.config.WHATSAPP_BOT_NUMBER = ""
        self.assert_issued(self.issue(True), "unavailable")
        self.send.assert_not_called()

    def test_public_existing_rate_limit_is_retained(self):
        for _ in range(10):
            self.assertEqual(self.issue(True).status_code, 201)
        self.assertEqual(self.issue(True).status_code, 429)
        self.send.assert_not_called()

    def test_consent_requires_explicit_boolean_and_international_phone(self):
        for public_flow in (False, True):
            for phone in (None, "", "03111234567", "15555550123", "+01234567", "+1555abc0123", "+1234567890123456"):
                self.assertEqual(self.issue(public_flow, customer_phone=phone).status_code, 422)
            self.assertEqual(self.issue(public_flow, whatsapp_copy="true").status_code, 422)
        self.send.assert_not_called()

    def test_admin_attestation_requires_auth_and_admin_role(self):
        self.user.role = "staff"
        self.assertEqual(self.issue().status_code, 403)
        self.app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.issue().status_code, 401)
        self.send.assert_not_called()

    def test_tenant_counter_rejection_does_not_send(self):
        self.user.institution_id = 2
        self.assertEqual(self.issue().status_code, 404)
        self.send.assert_not_called()

    def test_international_numbers_are_not_country_guessed(self):
        from app.schemas.token import TokenCreate
        for phone in ("+44 (7700) 900-123", "+92 311 1234567"):
            result = TokenCreate(counter_id=1, customer_phone=phone, whatsapp_copy=True)
            self.assertTrue(result.customer_phone.startswith(phone[:3]))


if __name__ == "__main__":
    unittest.main()
