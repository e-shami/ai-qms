import re

import numpy as np
import pandas as pd

from pipeline.schema import RAW_COLUMNS

SOURCE_HOSPITAL = "hospital"
SOURCE_QUEUE_LOG = "queue_log"
SOURCE_SURVEY = "survey"

CONSTANT_COLUMNS = [c for c in RAW_COLUMNS if c not in ("arrival_ts", "called_ts", "service_start_ts", "service_end_ts")]


def _parse_dmy_hm(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, format="%d-%m-%Y %H:%M", errors="coerce", utc=True)


def _to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def _bucket_midpoint(value: str | None) -> float | None:
    if value is None:
        return None
    text = str(value).strip().lower().replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"\s+", " ", text)
    if text.startswith("less than"):
        number = re.search(r"([\d.]+)", text)
        return float(number.group(1)) / 2.0 if number else None
    if text.startswith("more than"):
        number = re.search(r"([\d.]+)", text)
        return float(number.group(1)) + 10.0 if number else None
    numbers = re.findall(r"([\d.]+)\s*-\s*([\d.]+)", text)
    if numbers:
        lo, hi = float(numbers[0][0]), float(numbers[0][1])
        return (lo + hi) / 2.0
    return None


def import_hospital(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    out = pd.DataFrame(index=df.index)
    out["institution_id"] = 1
    out["counter_id"] = pd.Series(pd.factorize(df["ProviderID"])[0] + 1, index=df.index)
    out["service_type"] = df["Department"].astype(str).str.strip()
    out["arrival_ts"] = _parse_dmy_hm(df["ActualArrivalTime"])
    out["called_ts"] = _parse_dmy_hm(df["TriageCompleteTime"])
    out["service_start_ts"] = _parse_dmy_hm(df["ProviderStartTime"])
    out["service_end_ts"] = _parse_dmy_hm(df["ProviderEndTime"])
    out["queue_length_at_arrival"] = np.nan
    out["facility_occupancy_rate"] = pd.to_numeric(df["FacilityOccupancyRate"], errors="coerce")
    out["triage_category"] = df["TriageCategory"].astype(str).str.strip()
    out["age_group"] = df["AgeGroup"].astype(str).str.strip()
    out["source"] = SOURCE_HOSPITAL
    return out


def import_queue_log(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)

    def parse_day_min(s: str) -> pd.Timestamp:
        day, clock = str(s).strip().split(" ")
        day_part, month_part, year_part = day.split("-")
        hour_part, minute_part = clock.split(".")
        return pd.Timestamp(
            year=int(year_part),
            month=int(month_part),
            day=int(day_part),
            hour=int(hour_part),
            minute=int(minute_part),
            tz="UTC",
        )

    out = pd.DataFrame(index=df.index)
    out["institution_id"] = 2
    out["counter_id"] = 1
    out["service_type"] = "general"
    out["arrival_ts"] = df["arrival_time"].map(parse_day_min)
    out["called_ts"] = df["start_time"].map(parse_day_min)
    out["service_start_ts"] = df["start_time"].map(parse_day_min)
    out["service_end_ts"] = _to_utc(df["finish_time"])
    out["queue_length_at_arrival"] = pd.to_numeric(df["queue_length"], errors="coerce")
    out["reported_wait_time"] = pd.to_numeric(df["wait_time"], errors="coerce")
    out["source"] = SOURCE_QUEUE_LOG
    return out


def import_survey(path: str) -> pd.DataFrame:
    df = pd.read_excel(path)
    out = pd.DataFrame(index=df.index)
    organization = df["Type of organization visited   "].fillna("unspecified").astype(str).str.strip()
    purpose = df["Purpose of your visit  "].fillna("unspecified").astype(str).str.strip()
    out["institution_id"] = pd.Series(pd.factorize(organization)[0] + 1, index=df.index)
    out["counter_id"] = 1
    out["service_type"] = purpose
    date_part = df["Date of visit   "].astype(str).str.strip()
    time_part = df["Arrival time    "].astype(str).str.strip()
    out["arrival_ts"] = _to_utc(date_part + " " + time_part)
    wait_mid = df["How long did you wait before service started?   "].map(_bucket_midpoint)
    service_mid = df["How long did your service take?   "].map(_bucket_midpoint)
    service_start = out["arrival_ts"] + pd.to_timedelta(wait_mid.fillna(0), unit="m")
    out["called_ts"] = service_start
    out["service_start_ts"] = service_start
    out["service_end_ts"] = service_start + pd.to_timedelta(service_mid.fillna(0), unit="m")
    out["queue_length_at_arrival"] = df[
        "Approximately how many people were ahead of you?   "
    ].map(_bucket_midpoint)
    out["organization_type"] = organization
    out["source"] = SOURCE_SURVEY
    return out


def combine(collected_dir_or_files: list[str]) -> pd.DataFrame:
    frames = []
    for cls, path in collected_dir_or_files:
        frames.append(cls(path))
    combined = pd.concat(frames, ignore_index=True)
    return combined[RAW_COLUMNS + [c for c in combined.columns if c not in RAW_COLUMNS]]