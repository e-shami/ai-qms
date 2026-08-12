"""Phase 5 — peak/off-peak aggregation.

pandas groupby on hour-of-day / day-of-week, not a trained model
(architecture.md §2). Exports ``peak_table.csv`` (wait-time stats + is_peak
flag per (hour, day-of-week) bucket) into ``backend/app/ml/models/`` for the
backend's optimizer and predictor fallback.

Run:  python -m pipeline.peaks   (from ml-notebooks/)
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipeline.train import CLEAN_CSV, MODELS_DIR, TARGET

MIN_SAMPLES_PER_BUCKET = 5


def build_peak_table(df: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        df.groupby(["hour_of_day", "day_of_week"])[TARGET]
        .agg(["mean", "size"])
        .reset_index()
    )
    grouped.columns = ["hour_of_day", "day_of_week", "avg_wait_min", "count"]
    overall_mean = df[TARGET].mean()
    grouped["is_peak"] = (
        (grouped["count"] >= MIN_SAMPLES_PER_BUCKET) & (grouped["avg_wait_min"] >= overall_mean)
    )
    return grouped, float(overall_mean)


def main() -> None:
    df = pd.read_csv(CLEAN_CSV)
    table, overall_mean = build_peak_table(df)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(MODELS_DIR / "peak_table.csv", index=False)
    peak_hours = table[table["is_peak"]]["hour_of_day"].sort_values().unique().tolist()
    with (MODELS_DIR / "peak_summary.json").open("w") as fh:
        json.dump(
            {
                "overall_mean_wait_min": round(overall_mean, 2),
                "min_samples_per_bucket": MIN_SAMPLES_PER_BUCKET,
                "peak_hours": peak_hours,
            },
            fh,
            indent=2,
        )
    print(f"overall mean wait: {overall_mean:.2f} min")
    print(f"peak hours: {peak_hours}")
    print(f"peak hours only (weekday): "
          f"{table[table['is_peak'] & (table['day_of_week'] < 5)]['hour_of_day'].sort_values().unique().tolist()}")
    print(f"wrote {MODELS_DIR / 'peak_table.csv'}")


if __name__ == "__main__":
    main()