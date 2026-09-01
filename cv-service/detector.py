import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
from ultralytics import YOLO

from config import settings


@dataclass
class Detection:
    bbox: Tuple[float, float, float, float]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    class_name: str


class YOLODetector:
    def __init__(self):
        self.model = YOLO(settings.YOLO_MODEL)
        self.model.to(settings.YOLO_DEVICE)
        self.conf_threshold = settings.YOLO_CONF_THRESHOLD
        self.iou_threshold = settings.YOLO_IOU_THRESHOLD
        self.classes = settings.YOLO_CLASSES
        self.min_area = settings.MIN_DETECTION_AREA

        # Warm up
        dummy = np.zeros((settings.CAMERA_HEIGHT, settings.CAMERA_WIDTH, 3), dtype=np.uint8)
        _ = self.model(dummy, verbose=False)
        print(f"✅ YOLO model loaded: {settings.YOLO_MODEL} on {settings.YOLO_DEVICE}")

    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Run detection on frame, return filtered person detections."""
        results = self.model(
            frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            classes=self.classes,
            verbose=False,
            device=settings.YOLO_DEVICE,
        )

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                cls_id = int(box.cls[0].cpu().numpy())

                # Filter by area
                area = (x2 - x1) * (y2 - y1)
                if area < self.min_area:
                    continue

                detections.append(Detection(
                    bbox=(float(x1), float(y1), float(x2), float(y2)),
                    confidence=conf,
                    class_id=cls_id,
                    class_name=result.names[cls_id] if cls_id in result.names else "unknown",
                ))

        return detections

    def draw_detections(self, frame: np.ndarray, detections: List[Detection]) -> np.ndarray:
        """Draw detection boxes on frame."""
        for det in detections:
            x1, y1, x2, y2 = map(int, det.bbox)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"{det.class_name} {det.confidence:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        return frame