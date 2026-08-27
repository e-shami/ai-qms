"""Wait-time prediction service.

Wraps the promoted model artifact (Random Forest primary) with input
validation and a rule-of-thumb fallback (peak-table mean) so prediction
never crashes the request — per rules.md error-handling baseline.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

MODELS_DIR = Path(__file__).resolve().parent / "models"
FEATURE_META = MODELS_DIR / "feature_meta.json"
MODEL_FILE = MODELS_DIR / "wait_time_model.joblib"
PEAK_TABLE = MODELS_DIR / "peak_table.csv"

HOUR_MIN, HOUR_MAX = 0, 23
DOW_MIN, DOW_MAX = 0, 6
QUEUE_LENGTH_MAX = 200.0


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
        """Estimate wait time in minutes; falls back to a rule-of-thumb."""
        try:
            meta = self._load_meta()
            model = self._load_model()
            if model is None:
                return self.fallback(hour_of_day, day_of_week)
            features = meta["features"]
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
                return self.fallback(hour_of_day, day_of_week)
            return round(float(np.clip(pred, meta["min_wait"], meta["max_wait"])), 1)
        except Exception:
            return self.fallback(hour_of_day, day_of_week)

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
        service_row = [1.0 if service_type == name[8:] else 0.0 for name in service_cols]
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