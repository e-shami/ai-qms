"""Deterministic terminal-transition races using a disposable in-memory database."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "isolated-test-not-for-deployment"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.v1 import public, tokens
from app.database import Base, get_db
from app.models import Counter, Institution, Token, TokenStatus
from app.models.user import utcnow
from app.services import queue_service, token_service
from app.utils.rate_limit import SlidingWindowLimiter


class TokenPositionRaceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                                    poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            db.add(Institution(id=1, name="Hospital", type="hospital"))
            db.add(Counter(id=1, institution_id=1, name="Desk"))
            db.commit()
        app = FastAPI()
        app.include_router(tokens.router)
        app.include_router(public.router)

        def database():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = database
        self.user = SimpleNamespace(id=1, institution_id=1, role="admin")
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        for module in (tokens, public):
            mock = patch.object(module, "broadcast_queue", new_callable=AsyncMock)
            mock.start()
            self.addCleanup(mock.stop)
        for name in ("public_issue_limiter", "public_lookup_limiter"):
            mock = patch.object(public, name, SlidingWindowLimiter(1000, 60))
            mock.start()
            self.addCleanup(mock.stop)

    def disappear(self, db, token):
        self.assertIn(token.status, queue_service.NON_TERMINAL_STATUSES)
        # Commit outside the reader's identity map, after it loaded active status.
        with Session(self.engine) as writer:
            writer.execute(update(Token).where(Token.id == token.id).values(
                status=TokenStatus.NO_SHOW, completed_at=utcnow()))
            writer.commit()
        self.assertIn(token.status, queue_service.NON_TERMINAL_STATUSES)
        return self.position(db, token)

    def race(self, module):
        self.position = queue_service.token_position
        return patch.object(module, "token_position", side_effect=self.disappear)

    def assert_terminal(self, out, public_view=False):
        self.assertEqual(out["status"], "no_show")
        self.assertIsNotNone(out["completed_at"])
        self.assertIsNone(out["position"])
        if public_view:
            self.assertIsNone(out["people_ahead"])
            self.assertIsNone(out["estimated_wait_min"])
        else:
            self.assertIsNone(out["eta_min"])

    def test_loaded_active_builders_refresh_terminal_status(self):
        for builder in (queue_service.token_out, token_service.build_public_ticket):
            with self.subTest(builder=builder.__name__), Session(self.engine) as db:
                token, _ = token_service.issue_token(db, institution_id=1,
                    counter_id=1, customer_name=None)
                module = queue_service if builder == queue_service.token_out else token_service
                with self.race(module), patch.object(token_service, "estimate_wait_minutes") as estimate:
                    out = builder(db, token).model_dump(mode="json")
                self.assert_terminal(out, module == token_service)
                estimate.assert_not_called()

    def test_lookup_returns_200_when_loaded_token_disappears(self):
        for path, module in (("/tokens", queue_service),
                             ("/public/tokens/DES-0002?institution_id=1", token_service)):
            self.assertEqual(self.client.post("/tokens", json={"counter_id": 1}).status_code, 201)
            with self.race(module):
                response = self.client.get(path)
            self.assertEqual(response.status_code, 200, response.text)
            out = response.json()
            self.assert_terminal(out if module == token_service else out["items"][0],
                                 module == token_service)

    def test_committed_issuance_returns_201_with_null_position(self):
        for path, payload in (("/tokens", {"counter_id": 1}),
                              ("/public/tokens", {"institution_id": 1, "counter_id": 1,
                               "customer_cnic": "0000000000001", "referral_source": "website"})):
            with self.subTest(path=path), self.race(token_service):
                response = self.client.post(path, json=payload)
            self.assertEqual(response.status_code, 201, response.text)
            self.assert_terminal(response.json(), path.startswith("/public"))
            with Session(self.engine) as db:
                token = db.scalar(select(Token).where(Token.token_number == response.json()["token_number"]))
                self.assertEqual(token.status, TokenStatus.NO_SHOW)

    def test_missing_position_does_not_bypass_tenant_checks(self):
        self.assertEqual(self.client.post("/tokens", json={"counter_id": 1}).status_code, 201)
        self.user.institution_id = 2
        with patch.object(queue_service, "token_position") as position:
            self.assertEqual(self.client.post("/tokens/1/no-show").status_code, 404)
            self.assertEqual(self.client.post("/tokens", json={"counter_id": 1}).status_code, 404)
            position.assert_not_called()


if __name__ == "__main__":
    unittest.main()
