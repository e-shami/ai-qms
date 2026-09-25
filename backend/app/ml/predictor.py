"""Validated shadow inference; live estimates remain empirical/heuristic.

The historical packaged RF has an incompatible post-service feature and is
rejected. The legacy numeric interface retains its historical peak fallback.
"""
from __future__ import annotations

import json
import logging
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from sklearn.exceptions import InconsistentVersionWarning

MODELS_DIR = Path(__file__).resolve().parent / "models"
FEATURE_META = MODELS_DIR / "feature_meta.json"
MODEL_FILE = MODELS_DIR / "wait_time_model.joblib"
PEAK_TABLE = MODELS_DIR / "peak_table.csv"

HOUR_MIN, HOUR_MAX = 0, 23
DOW_MIN, DOW_MAX = 0, 6
QUEUE_LENGTH_MAX = 200.0
NUMERIC_FEATURES = [
    "institution_id", "counter_id", "queue_length_at_arrival",
    "hour_of_day", "day_of_week", "is_weekend",
]
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelEstimate:
    estimate_min: float | None
    status: Literal["shadow", "unavailable", "invalid_contract", "invalid_input", "unknown_service", "inference_failed"]


class Predictor:
    def __init__(self) -> None:
        self._model = None
        self._meta: dict | None = None
        self._peak: pd.DataFrame | None = None
        self._overall_mean: float | None = None

    # -- lazy loading --------------------------------------------------------

    def _load_meta(self) -> dict:
        if self._meta is None:
            with FEATURE_META.open("r") as fh:
                self._meta = json.load(fh)
        return self._meta

    def _load_model(self):
        if self._model is None:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", InconsistentVersionWarning)
                    self._model = joblib.load(MODEL_FILE)
            except FileNotFoundError:
                self._model = None
        return self._model

    def _load_peak(self) -> tuple[pd.DataFrame, float]:
        try:
            if self._peak is None:
                self._peak = pd.read_csv(PEAK_TABLE)
            mean = self._overall_mean
            if mean is None:
                with (MODELS_DIR / "peak_summary.json").open("r") as fh:
                    mean = float(json.load(fh)["overall_mean_wait_min"])
                self._overall_mean = mean
            return self._peak, mean
        except (FileNotFoundError, KeyError, ValueError):
            return pd.DataFrame(), 54.5

    # -- public API ----------------------------------------------------------

    def predict(
        self,
        *,
        institution_id: int,
        counter_id: int,
        service_type: str | None,
        hour_of_day: int,
        day_of_week: int,
        is_weekend: bool,
        queue_length_at_arrival: float,
    ) -> float:
        """Legacy numeric interface; not a live customer estimate."""
        result = self.evaluate(
            institution_id=institution_id, counter_id=counter_id,
            service_type=service_type, hour_of_day=hour_of_day,
            day_of_week=day_of_week, is_weekend=is_weekend,
            queue_length_at_arrival=queue_length_at_arrival,
        )
        return result.estimate_min if result.estimate_min is not None else self.fallback(hour_of_day, day_of_week)

    def evaluate(
        self, *, institution_id: int, counter_id: int, service_type: str | None,
        hour_of_day: int, day_of_week: int, is_weekend: bool,
        queue_length_at_arrival: float,
    ) -> ModelEstimate:
        """Shadow inference only. Numeric training IDs have no live tenant mapping.

        Load only operator-controlled, packaged joblib files: pickle is executable
        code, not a safe format for uploads or externally supplied model paths.
        Missing/invalid models never masquerade as successful ML predictions.
        """
        try:
            meta = self._load_meta()
        except Exception:
            return ModelEstimate(None, "unavailable")
        try:
            services = meta["service_columns"]
            if (
                meta["version"] not in (1, 2)
                or meta["target"] != "wait_time_min"
                or meta["numeric_features"] != NUMERIC_FEATURES
                or meta["features"] != NUMERIC_FEATURES + services
                or len(set(meta["features"])) != len(meta["features"])
                or any(not isinstance(c, str) or not c.startswith("service_") or c in {
                    "service_time_min", "service_start_ts", "service_end_ts", "service_type",
                } for c in services)
                or not 0 <= float(meta["min_wait"]) < float(meta["max_wait"]) <= 240
            ):
                return ModelEstimate(None, "invalid_contract")
        except (KeyError, TypeError, ValueError):
            return ModelEstimate(None, "invalid_contract")
        try:
            values = [institution_id, counter_id, queue_length_at_arrival, hour_of_day, day_of_week]
            if (
                not all(np.isfinite(v) for v in values)
                or institution_id <= 0 or counter_id <= 0
                or not 0 <= queue_length_at_arrival <= QUEUE_LENGTH_MAX
                or not 0 <= hour_of_day <= 23 or int(hour_of_day) != hour_of_day
                or not 0 <= day_of_week <= 6 or int(day_of_week) != day_of_week
                or is_weekend != (day_of_week >= 5)
            ):
                return ModelEstimate(None, "invalid_input")
        except (TypeError, ValueError):
            return ModelEstimate(None, "invalid_input")
        if not service_type or f"service_{service_type}" not in services:
            return ModelEstimate(None, "unknown_service")
        try:
            model = self._load_model()
            if model is None:
                return ModelEstimate(None, "unavailable")
            if model.n_features_in_ != len(meta["features"]):
                return ModelEstimate(None, "invalid_contract")
            row = self._build_row(
                meta,
                institution_id=institution_id,
                counter_id=counter_id,
                service_type=service_type,
                hour_of_day=hour_of_day,
                day_of_week=day_of_week,
                is_weekend=is_weekend,
                queue_length_at_arrival=queue_length_at_arrival,
            )
            pred = float(model.predict(np.asarray([row], dtype=float))[0])
            if not np.isfinite(pred):
                return ModelEstimate(None, "inference_failed")
            return ModelEstimate(round(float(np.clip(pred, meta["min_wait"], meta["max_wait"])), 1), "shadow")
        except Exception:
            logger.warning("Wait-time model inference failed; live estimator unaffected")
            return ModelEstimate(None, "inference_failed")

    def fallback(self, hour_of_day: int, day_of_week: int) -> float:
        """Rule-of-thumb estimate: peak-table bucket mean, else overall mean."""
        try:
            table, overall_mean = self._load_peak()
            if table.empty:
                return round(overall_mean, 1)
            bucket = table[
                (table["hour_of_day"] == int(hour_of_day))
                & (table["day_of_week"] == int(day_of_week))
            ]
            value = float(bucket["avg_wait_min"].iloc[0]) if len(bucket) else overall_mean
            return round(float(np.clip(value, 0.0, 240.0)), 1)
        except Exception:
            return 54.5

    # -- helpers -------------------------------------------------------------

    def _build_row(
        self,
        meta: dict,
        *,
        institution_id: int,
        counter_id: int,
        service_type: str | None,
        hour_of_day: int,
        day_of_week: int,
        is_weekend: bool,
        queue_length_at_arrival: float,
    ) -> list[float]:
        service_cols: list[str] = meta["service_columns"]
        service_row = [1.0 if service_type == name.removeprefix("service_") else 0.0 for name in service_cols]
        return [
            float(institution_id),
            float(counter_id),
            float(min(max(queue_length_at_arrival, 0.0), QUEUE_LENGTH_MAX)),
            float(min(max(hour_of_day, HOUR_MIN), HOUR_MAX)),
            float(min(max(day_of_week, DOW_MIN), DOW_MAX)),
            float(1.0 if is_weekend else 0.0),
            *service_row,
        ]


predictor = Predictor()
