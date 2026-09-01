import cv2
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field

from config import settings


@dataclass
class Track:
    track_id: int
    bbox: Tuple[float, float, float, float]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    age: int = 0  # Frames since last update
    hits: int = 1  # Total detection matches
    time_since_update: int = 0
    roi_counter_id: Optional[str] = None
    entry_time: Optional[float] = None  # Timestamp when entered ROI
    last_position: Tuple[float, float] = field(default_factory=lambda: (0.0, 0.0))

    def center(self) -> Tuple[float, float]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)


class ByteTrackWrapper:
    """Wrapper around Ultralytics' built-in ByteTrack for simpler interface."""

    def __init__(self):
        # Ultralytics handles tracking internally when we call model.track()
        # We just need to manage track state for our analytics
        self.tracks: Dict[int, Track] = {}
        self.next_id = 1
        self.max_age = 30  # Max frames to keep lost track
        self.min_hits = 3  # Min hits before track is confirmed

    def update(self, detections: List, frame_idx: int, roi_manager=None) -> List[Track]:
        """
        Update tracks with new detections.
        detections: List of (bbox, conf, class_id, track_id) from YOLO.track()
        """
        active_tracks = []

        # Convert YOLO track results to our Track objects
        for det in detections:
            bbox, conf, cls_id, track_id = det
            track_id = int(track_id)

            if track_id in self.tracks:
                track = self.tracks[track_id]
                track.bbox = bbox
                track.confidence = conf
                track.class_id = cls_id
                track.age += 1
                track.hits += 1
                track.time_since_update = 0
                track.last_position = track.center()
            else:
                track = Track(
                    track_id=track_id,
                    bbox=bbox,
                    confidence=conf,
                    class_id=cls_id,
                    entry_time=None,
                )
                self.tracks[track_id] = track

            # Check ROI entry/exit
            if roi_manager and settings.CAMERA_COUNTER_ID:
                roi = roi_manager.get_roi_for_counter(settings.CAMERA_COUNTER_ID)
                if roi:
                    in_roi = roi.contains_box_center(bbox)
                    if in_roi and track.roi_counter_id is None:
                        track.roi_counter_id = settings.CAMERA_COUNTER_ID
                        track.entry_time = frame_idx / settings.CAMERA_FPS
                    elif not in_roi and track.roi_counter_id is not None:
                        track.roi_counter_id = None
                        track.entry_time = None

            active_tracks.append(track)

        # Age out lost tracks
        lost_ids = []
        for tid, track in self.tracks.items():
            if track.time_since_update > self.max_age:
                lost_ids.append(tid)
            else:
                track.time_since_update += 1

        for tid in lost_ids:
            del self.tracks[tid]

        # Return confirmed tracks (hits >= min_hits)
        confirmed = [t for t in active_tracks if t.hits >= self.min_hits]
        return confirmed

    def get_tracks_in_roi(self, counter_id: str) -> List[Track]:
        """Get all tracks currently inside a specific ROI."""
        return [t for t in self.tracks.values() if t.roi_counter_id == counter_id]

    def draw_tracks(self, frame: np.ndarray, tracks: List[Track]) -> np.ndarray:
        """Draw track IDs and trails on frame."""
        for track in tracks:
            x1, y1, x2, y2 = map(int, track.bbox)
            center = track.center()

            # Draw box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)

            # Draw track ID
            label = f"ID:{track.track_id}"
            if track.roi_counter_id:
                label += f" [{track.roi_counter_id}]"
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

            # Draw center point
            cv2.circle(frame, (int(center[0]), int(center[1])), 4, (0, 0, 255), -1)

        return frame