"""Counter/staff allocation suggestions.

Consumes the peak/off-peak aggregation table (peak detection is pandas
groupby, not a trained model) plus current queue state, and distributes
available staff across active counters. Not itself a trained model —
architecture.md §2 / phases.md Phase 5.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from app.ml.predictor import predictor, QUEUE_LENGTH_MAX

MODELS_DIR = Path(__file__).resolve().parent / "models"
PEAK_TABLE = MODELS_DIR / "peak_table.csv"
OVERALL_MEAN_FALLBACK = 54.5
PEAK_FACTOR_MIN, PEAK_FACTOR_MAX = 0.5, 3.0


@dataclass(frozen=True)
class CounterAllocation:
    counter_id: int
    name: str
    type: str | None
    waiting: int
    in_service: int
    suggested_staff: int
    peak_factor: float
    predicted_wait_min: float | None


class Optimizer:
    def __init__(self) -> None:
        self._table: pd.DataFrame | None = None
        self._overall_mean: float | None = None

    def _load(self) -> tuple[pd.DataFrame, float]:
        try:
            if self._table is None:
                self._table = pd.read_csv(PEAK_TABLE)
            mean = self._overall_mean
            if mean is None:
                with (MODELS_DIR / "peak_summary.json").open("r") as fh:
                    import json

                    mean = float(json.load(fh)["overall_mean_wait_min"])
                self._overall_mean = mean
            return self._table, mean
        except (FileNotFoundError, KeyError, ValueError):
            return pd.DataFrame(), OVERALL_MEAN_FALLBACK

    def peak_factor(self, hour_of_day: int, day_of_week: int) -> float:
        table, mean = self._load()
        if table.empty:
            return 1.0
        bucket = table[
            (table["hour_of_day"] == int(hour_of_day))
            & (table["day_of_week"] == int(day_of_week))
        ]
        value = float(bucket["avg_wait_min"].iloc[0]) / mean if len(bucket) else 1.0
        return float(min(max(value, PEAK_FACTOR_MIN), PEAK_FACTOR_MAX))

    def is_peak(self, hour_of_day: int, day_of_week: int) -> bool:
        table, _ = self._load()
        if table.empty:
            return False
        bucket = table[
            (table["hour_of_day"] == int(hour_of_day))
            & (table["day_of_week"] == int(day_of_week))
        ]
        return bool(len(bucket) and bucket["is_peak"].iloc[0])

    def suggest_allocation(
        self,
        *,
        hour_of_day: int,
        day_of_week: int,
        is_weekend: bool,
        institution_id: int,
        counters: list[dict],
        waiting_by_counter: dict[int, int],
        in_service_by_counter: dict[int, int],
        available_staff: int,
    ) -> list[CounterAllocation]:
        """Distribute ``available_staff`` across active counters by demand.

        Demand score per counter = (waiting + in_service*0.5 + 1) * peak_factor,
        staff assigned via largest-remainder so the total always equals
        ``available_staff``.
        """
        if available_staff <= 0 or not counters:
            return []
        factor = self.peak_factor(hour_of_day, day_of_week)
        scores: dict[int, float] = {}
        for counter in counters:
            waiting = waiting_by_counter.get(counter["id"], 0)
            in_service = in_service_by_counter.get(counter["id"], 0)
            scores[counter["id"]] = (waiting + in_service * 0.5 + 1.0) * factor

        total_score = sum(scores.values())
        exact = {cid: (score / total_score) * available_staff for cid, score in scores.items()}
        floors = {cid: int(v) for cid, v in exact.items()}
        remainder = available_staff - sum(floors.values())
        order = sorted(exact, key=lambda cid: (exact[cid] - floors[cid]), reverse=True)
        for cid in order[:remainder]:
            floors[cid] += 1

        return [
            self._allocate_for(
                counter,
                institution_id=institution_id,
                hour_of_day=hour_of_day,
                day_of_week=day_of_week,
                is_weekend=is_weekend,
                waiting=waiting_by_counter.get(counter["id"], 0),
                in_service=in_service_by_counter.get(counter["id"], 0),
                staff=floors[counter["id"]],
                factor=factor,
            )
            for counter in counters
        ]

    def _allocate_for(
        self,
        counter: dict,
        *,
        institution_id: int,
        hour_of_day: int,
        day_of_week: int,
        is_weekend: bool,
        waiting: int,
        in_service: int,
        staff: int,
        factor: float,
    ) -> CounterAllocation:
        predicted = None
        try:
            if waiting > 0:
                predicted = predictor.predict(
                    institution_id=institution_id,
                    counter_id=int(counter["id"]),
                    service_type=counter.get("type"),
                    hour_of_day=hour_of_day,
                    day_of_week=day_of_week,
                    is_weekend=is_weekend,
                    queue_length_at_arrival=float(min(waiting, QUEUE_LENGTH_MAX)),
                )
        except Exception:
            predicted = None
        return CounterAllocation(
            counter_id=int(counter["id"]),
            name=str(counter.get("name", "")),
            type=counter.get("type"),
            waiting=waiting,
            in_service=in_service,
            suggested_staff=staff,
            peak_factor=round(factor, 2),
            predicted_wait_min=predicted,
        )


optimizer = Optimizer()