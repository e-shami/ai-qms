from dataclasses import dataclass, field
from enum import Enum


class ServiceType(str, Enum):
    CHECKUP = "checkup"
    WITHDRAWAL = "withdrawal"
    DEPOSIT = "deposit"
    REGISTRATION = "registration"
    COMPLAINT = "complaint"


RAW_COLUMNS: list[str] = [
    "institution_id",
    "counter_id",
    "service_type",
    "arrival_ts",
    "called_ts",
    "service_start_ts",
    "service_end_ts",
    "queue_length_at_arrival",
]

CLEAN_COLUMNS: list[str] = [
    "institution_id",
    "counter_id",
    "service_type",
    "arrival_ts",
    "queue_length_at_arrival",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
]

TARGET_COLUMNS: list[str] = [
    "wait_time_min",
    "service_time_min",
]

NUMERIC_FEATURES: list[str] = [
    "institution_id",
    "counter_id",
    "queue_length_at_arrival",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
]

CATEGORICAL_FEATURES: list[str] = ["service_type"]

DATETIME_COLUMNS: list[str] = ["arrival_ts", "called_ts", "service_start_ts", "service_end_ts"]

DROP_ON_NULL: list[str] = [
    "arrival_ts",
    "called_ts",
    "service_start_ts",
    "service_end_ts",
]

FLAG_ON_NULL: list[str] = ["queue_length_at_arrival"]

OUTLIER_BOUNDS: dict[str, tuple[float, float]] = {
    "wait_time_min": (0.0, 240.0),
    "service_time_min": (0.0, 120.0),
    "queue_length_at_arrival": (0.0, 200.0),
}


@dataclass
class PipelineConfig:
    timezone: str = "UTC"
    invalid_ts_threshold_min: int = 480
    drop_incomplete_services: bool = True
    winsorize_bounds: bool = True
    encode_categorical: str = "onehot"
    inference_columns: list[str] = field(
        default_factory=lambda: NUMERIC_FEATURES + CATEGORICAL_FEATURES
    )