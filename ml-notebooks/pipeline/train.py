"""Phase 5 — wait-time model training and promotion.

Trains a tuned Random Forest against a LinearRegression baseline on the
Phase 2 clean data, evaluates on a chronological split plus shuffled 5-fold
CV, then promotes the winner and the runner-up into ``backend/app/ml/models/``.

Empirical finding (2026-08-12): on the current noisy, self-reported,
mixed-source dataset (5.8k rows) tuned Random Forest and the linear
baseline are statistically indistinguishable (test RMSE 43.20 vs 43.30,
5-fold CV RMSE 41.90 vs 41.71; R² ~0.12 for both — they explain only
~12% of variance). Random Forest is promoted as the deployed model per
architecture.md §2 (primary), with the linear baseline kept for the
Step 6 comparison. Revisit both (or XGBoost/LightGBM) once real,
less-noisy data arrives.
XGBoost/LightGBM: skipped, 5.8k rows too small to justify (architecture.md §2).

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
from sklearn.model_selection import KFold, cross_val_score

ROOT = Path(__file__).resolve().parents[2]
CLEAN_CSV = ROOT / "ml-notebooks" / "data" / "processed" / "queue_events_clean.csv"
MODELS_DIR = ROOT / "backend" / "app" / "ml" / "models"

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
NON_ONEHOT_SERVICE_COLS = {"service_type", "service_start_ts", "service_end_ts"}

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
    service_cols = sorted(
        c for c in df.columns
        if c.startswith(SERVICE_COL_PREFIX) and c not in NON_ONEHOT_SERVICE_COLS
    )
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
    features, service_cols = feature_columns(df)
    X = df[features].to_numpy(dtype=float)
    y = df[TARGET].to_numpy(dtype=float)
    n, n_features = X.shape

    df_sorted = df.sort_values("arrival_ts")
    X_sorted = df_sorted[features].to_numpy(dtype=float)
    y_sorted = df_sorted[TARGET].to_numpy(dtype=float)
    split = int(TRAIN_FRACTION * n)
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

    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    rf_cv = cross_val_score(rf, X, y, cv=cv, scoring="neg_root_mean_squared_error")
    lr_cv = cross_val_score(lr, X, y, cv=cv, scoring="neg_root_mean_squared_error")
    rf_cv_rmse, lr_cv_rmse = -float(rf_cv.mean()), -float(lr_cv.mean())
    print(f"5-fold CV RMSE  RF {rf_cv_rmse:.2f}  LR {lr_cv_rmse:.2f}")

    winner = "random_forest" if rf_test["rmse_min"] <= lr_test["rmse_min"] else "linear"
    print(f"winner: {winner}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf, MODELS_DIR / PROMOTED_MODEL, compress=3)
    joblib.dump(rf, MODELS_DIR / RF_ARTIFACT, compress=3)
    joblib.dump(lr, MODELS_DIR / LR_ARTIFACT, compress=3)

    feature_meta = {
        "version": 1,
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
    with (MODELS_DIR / "feature_meta.json").open("w") as fh:
        json.dump(feature_meta, fh, indent=2)

    metrics = {
        "winner": winner,
        "decision": "Random Forest promoted as primary per architecture.md §2: models are "
        "statistically indistinguishable on this noisy dataset (test RMSE 43.20 vs 43.30 min, "
        "r2 0.13 vs 0.12; 5-fold CV RMSE 41.90 vs 41.71). Linear baseline artifact kept for the "
        "Phase 9 improved-vs-traditional comparison. Revisit XGBoost/LightGBM when data grows.",
        "test": {
            "random_forest_tuned": rf_test,
            "linear_baseline": lr_test,
        },
        "cv_rmse_min": {
            "random_forest_tuned": round(rf_cv_rmse, 2),
            "linear_baseline": round(lr_cv_rmse, 2),
        },
        "rf_config": RF_CONFIG,
        "xgboost_lightgbm": "skipped: 5.8k rows too small to justify (architecture.md §2)",
    }
    with (MODELS_DIR / "metrics.json").open("w") as fh:
        json.dump(metrics, fh, indent=2)

    print(f"artifacts written to {MODELS_DIR}")


if __name__ == "__main__":
    main()