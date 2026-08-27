import numpy as np
import pandas as pd

from pipeline.schema import DATETIME_COLUMNS, RAW_COLUMNS, ServiceType

INTENSITY = np.array(
    [1.0, 0.6, 0.4, 0.3, 0.3, 0.4, 0.7, 1.4, 2.6, 3.8, 4.4, 4.0,
     3.4, 3.2, 3.4, 3.8, 4.2, 3.6, 2.6, 1.8, 1.4, 1.2, 1.0, 0.9]
)


def _hourly_rate(hour: int) -> float:
    rate = INTENSITY[hour % 24]
    return rate * 0.5 if hour < 8 else rate


def generate_events(
    n_institutions: int = 10,
    counters_per_institution: int = 3,
    n_days: int = 14,
    seed: int = 42,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base = pd.Timestamp("2026-06-01 08:00:00", tz="UTC")
    rows: list[dict] = []

    for institution_id in range(1, n_institutions + 1):
        counter_ids = [
            f"{institution_id}-{c}" for c in range(1, counters_per_institution + 1)
        ]
        for day in range(n_days):
            for hour in range(8, 18):
                n_arrivals = int(rng.poisson(max(1.0, _hourly_rate(hour) * 3)))
                for _ in range(n_arrivals):
                    minute = int(rng.integers(0, 60))
                    second = int(rng.integers(0, 60))
                    arrival = base + pd.Timedelta(days=day, hours=hour - 8, minutes=minute, seconds=second)

                    queue_length = int(rng.integers(0, 40))
                    service_type = str(rng.choice([s.value for s in ServiceType]))
                    counter_id = str(rng.choice(counter_ids))
                    queue_at_arrival = np.nan if rng.random() < 0.1 else float(queue_length)

                    if rng.random() < 0.12:
                        rows.append({
                            "institution_id": institution_id,
                            "counter_id": counter_id,
                            "service_type": service_type,
                            "arrival_ts": arrival.isoformat(),
                            "called_ts": None,
                            "service_start_ts": None,
                            "service_end_ts": None,
                            "queue_length_at_arrival": queue_at_arrival,
                        })
                        continue

                    wait_min = max(0.0, float(rng.gamma(2.0, 8.0)) * (1.0 + queue_length / 40.0))
                    service_min = float(rng.uniform(2.0, 25.0))
                    start = arrival + pd.Timedelta(minutes=wait_min)
                    called = start - pd.Timedelta(minutes=max(0.0, wait_min * rng.uniform(0.05, 0.4)))
                    if called < arrival:
                        called = arrival
                    end = start + pd.Timedelta(minutes=service_min)

                    rows.append({
                        "institution_id": institution_id,
                        "counter_id": counter_id,
                        "service_type": service_type,
                        "arrival_ts": arrival.isoformat(),
                        "called_ts": called.isoformat(),
                        "service_start_ts": start.isoformat(),
                        "service_end_ts": end.isoformat(),
                        "queue_length_at_arrival": queue_at_arrival,
                    })

    df = pd.DataFrame(rows, columns=RAW_COLUMNS)
    for col in DATETIME_COLUMNS:
        df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
    df["queue_length_at_arrival"] = pd.to_numeric(df["queue_length_at_arrival"], errors="coerce")
    return df.sort_values("arrival_ts", kind="mergesort").reset_index(drop=True)


def write_raw(df: pd.DataFrame, path: str) -> None:
    df.to_csv(path, index=False)