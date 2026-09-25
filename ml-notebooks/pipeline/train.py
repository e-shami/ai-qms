"""Offline candidate training, NOT automatic deployment.

The historical artifacts included post-service duration by mistake. Their
recorded metrics are not evidence for the corrected feature contract.
Candidates retain numeric IDs for historical comparison only, not live use.
Evaluate identity-free features and tenant-held-out performance before promotion.

Run:  python -m pipeline.train   (from ml-notebooks/)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit, cross_val_score

ROOT = Path(__file__).resolve().parents[2]
CLEAN_CSV = ROOT / "ml-notebooks" / "data" / "processed" / "queue_events_clean.csv"
MODELS_DIR = ROOT / "backend" / "app" / "ml" / "models"
CANDIDATES_DIR = ROOT / "ml-notebooks" / "data" / "candidates"

TARGET = "wait_time_min"
NUMERIC_FEATURES = [
    "institution_id",
    "counter_id",
    "queue_length_at_arrival",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
]
SERVICE_COL_PREFIX = "service_"

RANDOM_STATE = 42
TRAIN_FRACTION = 0.8
MIN_WAIT, MAX_WAIT = 0.0, 240.0

RF_CONFIG = {"n_estimators": 150, "max_depth": 6, "min_samples_leaf": 20, "random_state": RANDOM_STATE}

PROMOTED_MODEL = "wait_time_model.joblib"
RF_ARTIFACT = "wait_time_rf.joblib"
LR_ARTIFACT = "wait_time_baseline_linear.joblib"


def load_clean() -> pd.DataFrame:
    df = pd.read_csv(CLEAN_CSV)
    df["arrival_ts"] = pd.to_datetime(df["arrival_ts"], errors="coerce", utc=True)
    df = df.dropna(subset=["arrival_ts", TARGET]).copy()
    return df


def feature_columns(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    # Only explicit categories, never prefix-matched post-outcome columns.
    service_cols = sorted(SERVICE_COL_PREFIX + str(value) for value in df["service_type"].dropna().unique())
    for column in service_cols:
        expected = (df["service_type"] == column.removeprefix(SERVICE_COL_PREFIX)).astype(int)
        if column not in df or not df[column].eq(expected).all():
            raise ValueError(f"Invalid one-hot column: {column}")
    return NUMERIC_FEATURES + service_cols, service_cols


def evaluate(model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
    pred = np.clip(model.predict(X_test), MIN_WAIT, MAX_WAIT)
    return {
        "mae_min": round(float(mean_absolute_error(y_test, pred)), 2),
        "rmse_min": round(float(mean_squared_error(y_test, pred) ** 0.5), 2),
        "r2": round(float(r2_score(y_test, pred)), 4),
    }


def main() -> None:
    df = load_clean()
    df_sorted = df.sort_values("arrival_ts", kind="stable")
    n = len(df_sorted)
    split = int(TRAIN_FRACTION * n)
    features, service_cols = feature_columns(df_sorted.iloc[:split])
    n_features = len(features)
    X_sorted = df_sorted[features].to_numpy(dtype=float)
    y_sorted = df_sorted[TARGET].to_numpy(dtype=float)
    X_train, X_test = X_sorted[:split], X_sorted[split:]
    y_train, y_test = y_sorted[:split], y_sorted[split:]

    rf = RandomForestRegressor(**RF_CONFIG, n_jobs=-1)
    lr = LinearRegression()

    print(f"data: {n} rows, {n_features} features, services={len(service_cols)}")
    print(f"chronological split: train {len(X_train)} / test {len(X_test)}")

    rf.fit(X_train, y_train)
    lr.fit(X_train, y_train)

    rf_test = evaluate(rf, X_test, y_test)
    lr_test = evaluate(lr, X_test, y_test)
    print("test  RF(6/20) :", rf_test)
    print("test  LR       :", lr_test)

    cv = TimeSeriesSplit(n_splits=5)
    rf_cv = cross_val_score(rf, X_train, y_train, cv=cv, scoring="neg_root_mean_squared_error")
    lr_cv = cross_val_score(lr, X_train, y_train, cv=cv, scoring="neg_root_mean_squared_error")
    rf_cv_rmse, lr_cv_rmse = -float(rf_cv.mean()), -float(lr_cv.mean())
    print(f"Training-only temporal CV RMSE  RF {rf_cv_rmse:.2f}  LR {lr_cv_rmse:.2f}")

    winner = "random_forest" if rf_test["rmse_min"] <= lr_test["rmse_min"] else "linear"
    print(f"winner: {winner}")

    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf, CANDIDATES_DIR / PROMOTED_MODEL, compress=3)
    joblib.dump(rf, CANDIDATES_DIR / RF_ARTIFACT, compress=3)
    joblib.dump(lr, CANDIDATES_DIR / LR_ARTIFACT, compress=3)

    feature_meta = {
        "version": 2,
        "deployment": "shadow_only",
        "target": TARGET,
        "features": features,
        "numeric_features": NUMERIC_FEATURES,
        "service_columns": service_cols,
        "model_file": PROMOTED_MODEL,
        "winner": winner,
        "trained_on": datetime.now(timezone.utc).isoformat(),
        "rows": n,
        "min_wait": MIN_WAIT,
        "max_wait": MAX_WAIT,
    }
    with (CANDIDATES_DIR / "feature_meta.json").open("w") as fh:
        json.dump(feature_meta, fh, indent=2)

    metrics = {
        "winner": winner,
        "decision": "RF candidate and LR baseline saved for review, not promoted. "
        "No statistical significance or live-estimator superiority is claimed.",
        "validation": "Chronological 80/20 holdout; five temporal CV folds on training rows only. "
        "CV RMSE is unclipped; holdout predictions are clipped to target bounds. "
        "Numeric identities and zero-imputed missing queues still limit live applicability.",
        "test": {
            "random_forest_tuned": rf_test,
            "linear_baseline": lr_test,
        },
        "cv_rmse_min": {
            "random_forest_tuned": round(rf_cv_rmse, 2),
            "linear_baseline": round(lr_cv_rmse, 2),
        },
        "rf_config": RF_CONFIG,
        "xgboost_lightgbm": "not evaluated by this training script",
    }
    with (CANDIDATES_DIR / "metrics.json").open("w") as fh:
        json.dump(metrics, fh, indent=2)

    print(f"candidates written to {CANDIDATES_DIR}; deployed artifacts unchanged")


if __name__ == "__main__":
    main()
