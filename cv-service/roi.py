import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
import json

from config import settings


@dataclass
class ROI:
    counter_id: str
    name: str
    polygon: np.ndarray  # Shape (N, 2) - N points of polygon

    def contains(self, point: Tuple[float, float]) -> bool:
        """Check if a point (x, y) is inside the ROI polygon."""
        return cv2.pointPolygonTest(self.polygon, point, False) >= 0

    def contains_box_center(self, bbox: Tuple[float, float, float, float]) -> bool:
        """Check if the center of a bounding box is inside the ROI."""
        x1, y1, x2, y2 = bbox
        center = ((x1 + x2) / 2, (y1 + y2) / 2)
        return self.contains(center)


class ROIManager:
    def __init__(self, config_path: str = None):
        self.config_path = config_path or settings.ROI_CONFIG_PATH
        self.rois: List[ROI] = []
        self.default_roi: Optional[ROI] = None
        self.load_config()

    def load_config(self):
        """Load ROI configuration from JSON file."""
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
        except FileNotFoundError:
            print(f"⚠️ ROI config not found at {self.config_path}, using default")
            config = {"counters": [], "default_roi": None}

        self.rois = []
        for counter_config in config.get("counters", []):
            points = np.array(counter_config["roi"]["points"], dtype=np.float32)
            roi = ROI(
                counter_id=counter_config["counter_id"],
                name=counter_config["name"],
                polygon=points,
            )
            self.rois.append(roi)

        default = config.get("default_roi")
        if default:
            points = np.array(default["points"], dtype=np.float32)
            self.default_roi = ROI(
                counter_id="default",
                name="Default ROI",
                polygon=points,
            )

    def get_roi_for_counter(self, counter_id: str) -> Optional[ROI]:
        """Get ROI for a specific counter."""
        for roi in self.rois:
            if roi.counter_id == counter_id:
                return roi
        return self.default_roi

    def get_all_rois(self) -> List[ROI]:
        """Get all configured ROIs."""
        return self.rois

    def draw_rois(self, frame: np.ndarray, color: Tuple[int, int, int] = (0, 255, 0), thickness: int = 2) -> np.ndarray:
        """Draw all ROIs on frame for visualization."""
        for roi in self.rois:
            cv2.polylines(frame, [roi.polygon.astype(np.int32)], True, color, thickness)
            # Draw label
            center = np.mean(roi.polygon, axis=0).astype(int)
            cv2.putText(frame, roi.name, tuple(center), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        if self.default_roi:
            cv2.polylines(frame, [self.default_roi.polygon.astype(np.int32)], True, (255, 0, 0), 1)
        return frame