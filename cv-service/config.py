import os
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service
    SERVICE_NAME: str = "cv-service"
    LOG_LEVEL: str = "INFO"

    # Camera
    CAMERA_SOURCE: str = "0"  # USB index, RTSP URL, or video file path
    CAMERA_WIDTH: int = 640
    CAMERA_HEIGHT: int = 480
    CAMERA_FPS: int = 15

    # YOLO
    YOLO_MODEL: str = "yolov8n.pt"  # nano model for CPU speed
    YOLO_CONF_THRESHOLD: float = 0.4
    YOLO_IOU_THRESHOLD: float = 0.5
    YOLO_CLASSES: list[int] = Field(default_factory=lambda: [0])  # person only
    YOLO_DEVICE: str = "cpu"  # "cpu" or "cuda:0"

    # ByteTrack
    TRACKER_CONFIG: str = "bytetrack.yaml"
    TRACK_BUFFER: int = 30
    MATCH_THRESH: float = 0.8

    # ROI (per counter, loaded from config file)
    ROI_CONFIG_PATH: str = "roi_config.json"

    # Backend
    BACKEND_URL: str = "http://backend:8000/api/v1"
    INTERNAL_API_KEY: str = ""
    PUSH_INTERVAL_SECONDS: int = 2  # How often to push updates

    # Counter mapping (camera -> counter_id)
    CAMERA_COUNTER_ID: str = ""

    # Processing
    FRAME_SKIP: int = 1  # Process every N frames (1 = every frame)
    MIN_DETECTION_AREA: int = 100  # Minimum bbox area to count


settings = Settings()