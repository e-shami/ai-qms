import pandas as pd

from pipeline.schema import (
    DATETIME_COLUMNS,
    DROP_ON_NULL,
    FLAG_ON_NULL,
    OUTLIER_BOUNDS,
    PipelineConfig,
)


def normalize_timestamps(df: pd.DataFrame, timezone: str = "UTC") -> pd.DataFrame:
    out = df.copy()
    for col in DATETIME_COLUMNS:
        out[col] = pd.to_datetime(out[col], errors="coerce", utc=True).dt.tz_convert(timezone)
    return out


def filter_missing(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out = out.dropna(subset=DROP_ON_NULL)
    out["queue_length_missing"] = out["queue_length_at_arrival"].isna()
    out["queue_length_at_arrival"] = out["queue_length_at_arrival"].fillna(0.0)
    return out


def derive_time_metrics(df: pd.DataFrame, drop_incomplete: bool = True) -> pd.DataFrame:
    out = df.copy()
    out["wait_time_min"] = (out["service_start_ts"] - out["arrival_ts"]).dt.total_seconds() / 60.0
    out["service_time_min"] = (out["service_end_ts"] - out["service_start_ts"]).dt.total_seconds() / 60.0
    if drop_incomplete:
        out = out[out["wait_time_min"] >= 0.0]
    else:
        out.loc[out["wait_time_min"] < 0.0, "wait_time_min"] = 0.0
    return out


def enforce_outliers(df: pd.DataFrame, config: PipelineConfig) -> pd.DataFrame:
    out = df.copy()
    if config.winsorize_bounds:
        for col, (lo, hi) in OUTLIER_BOUNDS.items():
            if col not in out.columns:
                continue
            out[col] = out[col].clip(lower=lo, upper=hi)
        return out
    mask = pd.Series(True, index=out.index)
    for col, (lo, hi) in OUTLIER_BOUNDS.items():
        if col in out.columns:
            mask &= out[col].between(lo, hi)
    return out[mask]


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["hour_of_day"] = out["arrival_ts"].dt.hour.astype(int)
    out["day_of_week"] = out["arrival_ts"].dt.dayofweek.astype(int)
    out["is_weekend"] = (out["day_of_week"] >= 5).astype(int)
    return out


def encode_categoricals(df: pd.DataFrame, strategy: str = "onehot"):
    out = df.copy()
    if strategy == "onehot":
        encoded = pd.get_dummies(out["service_type"], prefix="service", dtype=int)
        out = pd.concat([out, encoded], axis=1)
        return out, None
    if strategy == "label":
        labels = {v: i for i, v in enumerate(sorted(out["service_type"].unique()))}
        out["service_type_encoded"] = out["service_type"].map(labels)
        return out, labels
    raise ValueError(f"unsupported encoding strategy: {strategy}")


def run_pipeline(df: pd.DataFrame, config: PipelineConfig | None = None) -> pd.DataFrame:
    config = config or PipelineConfig()
    out = normalize_timestamps(df, config.timezone)
    out = filter_missing(out)
    out = derive_time_metrics(out, config.drop_incomplete_services)
    out = enforce_outliers(out, config)
    out = add_time_features(out)
    out, _ = encode_categoricals(out, config.encode_categorical)
    return out


def run_from_file(raw_path: str, processed_path: str, config: PipelineConfig | None = None) -> dict:
    raw = pd.read_csv(raw_path)
    raw_cols = [c for c in raw.columns]
    for col in DATETIME_COLUMNS:
        if col in raw_cols:
            raw[col] = pd.to_datetime(raw[col], errors="coerce", utc=True)
    processed = run_pipeline(raw, config)
    processed.to_csv(processed_path, index=False)
    return {"rows_raw": len(raw), "rows_processed": len(processed)}