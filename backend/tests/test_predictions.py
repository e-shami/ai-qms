"""Isolated SQLite API tests and trusted repository-artifact smoke tests.

Run from backend with PYTHONPATH including ../ml-notebooks:
python -m unittest discover -s tests -v
No application database, training writes, or outbound messages are used.
"""
import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-only-secret-key-not-for-deployment"

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.api.v1.predictions import router
from app.database import Base, get_db
from app.ml.predictor import FEATURE_META, MODEL_FILE, MODELS_DIR, NUMERIC_FEATURES, ModelEstimate, Predictor
from app.ml.optimizer import Optimizer
from app.models import Counter, Institution, Token, TokenStatus, User
from app.services.token_service import build_public_ticket
from pipeline.train import feature_columns
from pipeline import train


INPUT = dict(institution_id=9001, counter_id=9002, service_type="general",
             hour_of_day=10, day_of_week=0, is_weekend=False, queue_length_at_arrival=3)


class PredictorTests(unittest.TestCase):
    def setUp(self):
        self.predictor = Predictor()
        self.predictor._meta = dict(version=2, target="wait_time_min", numeric_features=NUMERIC_FEATURES,
                                    service_columns=["service_general"], features=NUMERIC_FEATURES + ["service_general"],
                                    min_wait=0, max_wait=240)
        self.predictor._model = Mock(n_features_in_=7)
        self.predictor._model.predict.return_value = np.array([12.3])

    def test_correct_feature_order_and_service_encoding(self):
        result = self.predictor.evaluate(**INPUT)
        self.assertEqual((result.estimate_min, result.status), (12.3, "shadow"))
        np.testing.assert_array_equal(self.predictor._model.predict.call_args.args[0], [[9001, 9002, 3, 10, 0, 0, 1]])

    def test_unseen_ids_are_shadow_never_live(self):
        for counter_id in (1, 99, 999999):
            self.assertEqual(self.predictor.evaluate(**{**INPUT, "counter_id": counter_id}).status, "shadow")

    def test_contract_rejected_before_deserialization(self):
        self.predictor._meta["service_columns"].append("service_time_min")
        self.predictor._meta["features"].append("service_time_min")
        with patch("app.ml.predictor.joblib.load") as load:
            self.assertEqual(self.predictor.evaluate(**INPUT).status, "invalid_contract")
            load.assert_not_called()

    def test_reordered_or_missing_metadata_rejected(self):
        for meta in ({}, {**self.predictor._meta, "features": list(reversed(self.predictor._meta["features"]))}):
            self.predictor._meta = meta
            self.assertEqual(self.predictor.evaluate(**INPUT).status, "invalid_contract")

    def test_invalid_inputs_not_silently_clamped(self):
        for key, value in (("queue_length_at_arrival", -1), ("queue_length_at_arrival", 201),
                           ("queue_length_at_arrival", float("nan")), ("hour_of_day", 24),
                           ("day_of_week", 7), ("is_weekend", True), ("counter_id", float("inf"))):
            self.assertEqual(self.predictor.evaluate(**{**INPUT, key: value}).status, "invalid_input")
        self.predictor._model.predict.assert_not_called()

    def test_unknown_service_is_explicit(self):
        for service in (None, "new service"):
            self.assertEqual(self.predictor.evaluate(**{**INPUT, "service_type": service}).status, "unknown_service")

    def test_missing_metadata_and_model(self):
        with patch.object(self.predictor, "_load_meta", side_effect=FileNotFoundError):
            self.assertEqual(self.predictor.evaluate(**INPUT).status, "unavailable")
        with patch.object(self.predictor, "_load_model", return_value=None):
            self.assertEqual(self.predictor.evaluate(**INPUT).status, "unavailable")

    def test_corrupt_model_nonfinite_prediction_and_wrong_dimensions(self):
        with patch.object(self.predictor, "_load_model", side_effect=ValueError):
            self.assertEqual(self.predictor.evaluate(**INPUT).status, "inference_failed")
        self.predictor._model.predict.return_value = [float("nan")]
        self.assertEqual(self.predictor.evaluate(**INPUT).status, "inference_failed")
        self.predictor._model.n_features_in_ = 8
        self.assertEqual(self.predictor.evaluate(**INPUT).status, "invalid_contract")

    def test_output_bounds(self):
        for value, expected in ((-10, 0), (400, 240), (0, 0)):
            self.predictor._model.predict.return_value = [value]
            self.assertEqual(self.predictor.evaluate(**INPUT).estimate_min, expected)

    def test_training_excludes_outcome_and_unrelated_prefix_columns(self):
        df = pd.DataFrame(dict(service_type=["general", "Emergency"], service_general=[1, 0],
                               service_Emergency=[0, 1], service_time_min=[5, 10], service_other=[1, 1]))
        features, services = feature_columns(df)
        self.assertEqual(services, ["service_Emergency", "service_general"])
        self.assertNotIn("service_time_min", features)
        self.assertNotIn("service_other", features)
        df.loc[0, "service_general"] = 5
        with self.assertRaises(ValueError):
            feature_columns(df)


class PredictionAPITests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            for id in (1, 9001):
                db.add(Institution(id=id, name=f"Test {id}"))
                db.add(Counter(id=id, institution_id=id, name="General", type="general"))
            db.add(Counter(id=9002, institution_id=9001, name="Inactive", is_active=False))
            db.commit()
        app = FastAPI()
        app.include_router(router)
        self.app = app

        def test_db():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: User(id=1, institution_id=9001)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def seed(self, *, institution_id=9001, served=0, waiting=0, duration=7):
        now = datetime(2026, 9, 1, tzinfo=timezone.utc)
        with Session(self.engine) as db:
            for i in range(served + waiting):
                db.add(Token(institution_id=institution_id, counter_id=institution_id, token_number=f"GEN-{i}",
                             status=TokenStatus.SERVED if i < served else TokenStatus.WAITING,
                             issued_at=now + timedelta(minutes=i),
                             called_at=now if i < served else None,
                             completed_at=now + timedelta(minutes=duration) if i < served else None))
            db.commit()

    def test_auth_scope_and_inactive_counter(self):
        for counter, expected in ((1, 404), (777, 404), (9002, 400)):
            self.assertEqual(self.client.get(f"/predictions/wait?counter_id={counter}").status_code, expected)
        del self.app.dependency_overrides[get_current_user]
        self.assertEqual(self.client.get("/predictions/wait?counter_id=9001").status_code, 401)

    def test_cold_start_zero_and_increasing_queue_with_rejected_model(self):
        for count in range(6):
            response = self.client.get("/predictions/wait?counter_id=9001")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["estimated_wait_min"], count * 5)
            self.assertEqual(data["method"], "heuristic")
            self.assertEqual(data["ml_status"], "invalid_contract")
            self.assertEqual(data["ml_mode"], "shadow_only")
            self.assertIsNone(data["ml_estimate_min"])
            self.seed(waiting=1)

    def test_empirical_history_is_tenant_scoped(self):
        self.seed(institution_id=1, served=10, duration=100)
        self.seed(waiting=3, served=4)
        self.assertEqual(self.client.get("/predictions/wait?counter_id=9001").json()["method"], "heuristic")
        self.seed(served=1)
        data = self.client.get("/predictions/wait?counter_id=9001").json()
        self.assertEqual((data["estimated_wait_min"], data["avg_service_min"], data["method"]), (21, 7, "empirical"))

    def test_missing_artifact_does_not_change_live_estimate(self):
        self.seed(waiting=2)
        with patch("app.ml.predictor.predictor._load_meta", side_effect=FileNotFoundError):
            data = self.client.get("/predictions/wait?counter_id=9001").json()
        self.assertEqual(data["estimated_wait_min"], 10)
        self.assertEqual(data["ml_status"], "unavailable")
        self.assertIsNone(data["ml_estimate_min"])

    def test_successful_shadow_result_never_overrides_live_estimate(self):
        self.seed(waiting=2)
        with patch("app.ml.predictor.predictor.evaluate", return_value=ModelEstimate(200, "shadow")):
            data = self.client.get("/predictions/wait?counter_id=9001").json()
        self.assertEqual(data["estimated_wait_min"], 10)
        self.assertEqual(data["ml_estimate_min"], 200)
        self.assertEqual(data["ml_status"], "shadow")

    def test_queue_count_is_explicitly_tenant_scoped(self):
        # A corrupt cross-tenant FK combination must not affect this tenant's count.
        with Session(self.engine) as db:
            db.add(Token(institution_id=1, counter_id=9001, token_number="OTHER", status=TokenStatus.WAITING))
            db.commit()
        self.assertEqual(self.client.get("/predictions/wait?counter_id=9001").json()["queue_ahead"], 0)

    def test_public_ticket_still_uses_live_estimator(self):
        self.seed(waiting=2)
        with Session(self.engine) as db:
            tickets = [build_public_ticket(db, token) for token in db.query(Token).order_by(Token.id)]
            self.assertEqual([ticket.estimated_wait_min for ticket in tickets], [0, 5])


class PackagedArtifactTests(unittest.TestCase):
    def test_candidate_training_round_trip_in_temporary_directory(self):
        # Tiny fixture tests serialization/contract, NOT product accuracy.
        n = 40
        df = pd.DataFrame(dict(
            institution_id=[1] * n, counter_id=[1] * n,
            queue_length_at_arrival=np.arange(n) % 5,
            hour_of_day=[10] * n, day_of_week=[0] * n, is_weekend=[0] * n,
            arrival_ts=pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC"),
            service_type=["general"] * 32 + ["holdout_only"] * 8,
            service_general=[1] * 32 + [0] * 8,
            service_holdout_only=[0] * 32 + [1] * 8,
            service_time_min=[10] * n, wait_time_min=(np.arange(n) % 5) * 3,
        ))
        original_bytes = MODEL_FILE.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with patch.object(train, "load_clean", return_value=df), \
                 patch.object(train, "CANDIDATES_DIR", directory), \
                 patch.object(train, "RF_CONFIG", {"n_estimators": 2, "random_state": 42}), \
                 contextlib.redirect_stdout(io.StringIO()):
                train.main()
            meta = json.loads((directory / "feature_meta.json").read_text())
            self.assertNotIn("service_time_min", meta["features"])
            self.assertNotIn("service_holdout_only", meta["features"])
            self.assertTrue((directory / "wait_time_baseline_linear.joblib").exists())
            with patch("app.ml.predictor.FEATURE_META", directory / "feature_meta.json"), \
                 patch("app.ml.predictor.MODEL_FILE", directory / "wait_time_model.joblib"):
                result = Predictor().evaluate(**INPUT)
            self.assertEqual(result.status, "shadow")
            self.assertTrue(np.isfinite(result.estimate_min))
        self.assertEqual(MODEL_FILE.read_bytes(), original_bytes)

    def test_real_inference_audit_and_runtime_rejection(self):
        # These are the existing tracked repository artifacts, never downloaded pickles.
        meta = json.loads(FEATURE_META.read_text())
        self.assertIn("service_time_min", meta["features"])
        model = joblib.load(MODEL_FILE)
        baseline = joblib.load(MODELS_DIR / "wait_time_baseline_linear.joblib")
        legacy_rows = [[9001, 9002, q, 10, 0, 0] + [0] * len(meta["service_columns"]) for q in (0, 1, 5, 10)]
        for artifact in (model, baseline):
            values = artifact.predict(np.asarray(legacy_rows, dtype=float))
            self.assertTrue(np.isfinite(values).all())
            print(f"Historical {type(artifact).__name__} unseen-ID raw outputs, queues 0/1/5/10: {values.round(2).tolist()}")
        self.assertEqual(Predictor().evaluate(**INPUT).status, "invalid_contract")

    def test_optimizer_does_not_label_peak_fallback_as_model_prediction(self):
        allocations = Optimizer().suggest_allocation(
            hour_of_day=10, day_of_week=0, is_weekend=False, institution_id=9001,
            counters=[dict(id=9002, name="General", type="general")],
            waiting_by_counter={9002: 3}, in_service_by_counter={}, available_staff=4)
        self.assertEqual(sum(a.suggested_staff for a in allocations), 4)
        self.assertIsNone(allocations[0].predicted_wait_min)


if __name__ == "__main__":
    unittest.main()
