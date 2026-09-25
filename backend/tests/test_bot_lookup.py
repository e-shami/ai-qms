"""Isolated in-memory tests; no application database or credentials are used."""
import os
import re
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["INTERNAL_API_KEY"] = "bot-test-key"
os.environ["SECRET_KEY"] = "test-only-secret-key-not-for-deployment"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.bot import router
from app.config import settings
from app.database import Base, get_db
from app.models import Counter, Institution, Token, TokenStatus


class BotLookupTests(unittest.TestCase):
    def setUp(self):
        key_patch = patch.object(settings, "INTERNAL_API_KEY", "bot-test-key")
        key_patch.start()
        self.addCleanup(key_patch.stop)
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

        @event.listens_for(self.engine, "connect")
        def sqlite_regexp(connection, _):
            # Emulate PostgreSQL's four-argument regexp_replace in this isolated DB.
            connection.create_function("regexp_replace", 4,
                                       lambda value, pattern, replacement, flags: re.sub(pattern, replacement, value) if value else None)

        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            for id in (1, 2, 3):
                db.add(Institution(id=id, name=f"Institution {id}", is_active=id != 3))
                db.add(Counter(id=id, institution_id=id, name="General"))
            for id in range(1, 13):
                institution_id = 3 if id == 12 else 1 + id % 2
                db.add(Token(id=id, institution_id=institution_id, counter_id=institution_id,
                             token_number="GEN-0001", customer_phone="+1 (555) 123-4567" if id != 11 else "15557654321",
                             customer_name="Not exposed", status=TokenStatus.WAITING,
                             issued_at=datetime(2026, 9, 1, 0, id, tzinfo=timezone.utc)))
            db.commit()
        app = FastAPI()
        app.include_router(router)

        def test_db():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def lookup(self, **payload):
        return self.client.post("/internal/bot/tokens/lookup", headers={"X-Internal-API-Key": "bot-test-key"},
                                json={"phone": "15551234567", **payload})

    def test_requires_internal_auth(self):
        for headers in ({}, {"X-Internal-API-Key": "wrong"}):
            response = self.client.post("/internal/bot/tokens/lookup", headers=headers, json={"phone": "15551234567"})
            self.assertIn(response.status_code, (401, 422))

    def test_existing_formatted_phones_paginate_across_institutions_without_pii(self):
        response = self.lookup()
        self.assertEqual(response.status_code, 200)
        page = response.json()
        self.assertTrue(page["has_more"])
        self.assertEqual([item["id"] for item in page["items"]], list(range(10, 2, -1)))
        self.assertEqual({item["institution_id"] for item in page["items"]}, {1, 2})
        self.assertNotIn("customer_phone", page["items"][0])
        self.assertNotIn("customer_name", page["items"][0])
        self.assertIn("position", page["items"][0])
        self.assertEqual([item["id"] for item in self.lookup(offset=8).json()["items"]], [2, 1])
        self.assertFalse(self.lookup(offset=8).json()["has_more"])

    def test_selected_id_cannot_bypass_phone_or_institution_visibility(self):
        for token_id in (11, 12, 999):
            self.assertEqual(self.lookup(token_id=token_id).json()["items"], [])
        self.assertEqual(self.lookup(token_id=1).json()["items"][0]["id"], 1)

    def test_phone_validation_and_number_filter(self):
        self.assertEqual(self.lookup(phone="123").status_code, 422)
        self.assertEqual(self.lookup(offset=-1).status_code, 422)
        self.assertEqual(self.lookup(token_number="GEN-9999").json()["items"], [])
        self.assertEqual(len(self.lookup(token_number="gen-0001").json()["items"]), 8)

    def test_active_ticket_uses_public_position_and_zero_wait(self):
        with Session(self.engine) as db:
            for token in db.query(Token).all():
                token.status = TokenStatus.SERVED
            db.get(Token, 1).status = TokenStatus.WAITING
            db.commit()
        ticket = self.lookup(token_id=1).json()["items"][0]
        self.assertEqual(ticket["position"], 1)
        self.assertEqual(ticket["people_ahead"], 0)
        self.assertEqual(ticket["estimated_wait_min"], 0)

    def test_only_active_tokens_are_returned_including_direct_selection(self):
        with Session(self.engine) as db:
            for token in db.query(Token).all():
                token.status = TokenStatus.SERVED
            for token_id, state in enumerate([
                TokenStatus.WAITING, TokenStatus.CALLED, TokenStatus.IN_SERVICE,
                TokenStatus.SERVED, TokenStatus.NO_SHOW, TokenStatus.DECLINED,
            ], start=1):
                db.get(Token, token_id).status = state
            db.commit()
        page = self.lookup().json()
        self.assertEqual([ticket["id"] for ticket in page["items"]], [3, 2, 1])
        self.assertFalse(page["has_more"])
        for token_id in (4, 5, 6):
            self.assertEqual(self.lookup(token_id=token_id).json()["items"], [])


if __name__ == "__main__":
    unittest.main()
