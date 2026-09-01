import time
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from collections import deque

from config import settings
from tracker import Track


@dataclass
class QueueMetrics:
    counter_id: str
    timestamp: float
    queue_length: int
    service_rate: float  # people per minute
    estimated_wait_min: float
    avg_dwell_time: float  # seconds
    tracks_in_roi: int
    tracks_served: int


class QueueAnalytics:
    def __init__(self, counter_id: str, window_size: int = 300):  # 5 min window
        self.counter_id = counter_id
        self.window_size = window_size  # seconds

        # Track dwell times for people who exit ROI
        self.completed_tracks: deque = deque(maxlen=100)
        self.current_tracks: Dict[int, Track] = {}

        # Service rate calculation
        self.service_events: deque = deque(maxlen=50)  # (timestamp, count)
        self.last_queue_length = 0

    def update(self, tracks: List[Track], frame_timestamp: float) -> QueueMetrics:
        """Update analytics with current tracks."""
        # Find tracks in our ROI
        roi_tracks = [t for t in tracks if t.roi_counter_id == self.counter_id]
        current_ids = {t.track_id for t in roi_tracks}
        previous_ids = set(self.current_tracks.keys())

        # Tracks that exited (were in ROI, now not)
        exited_ids = previous_ids - current_ids
        for tid in exited_ids:
            old_track = self.current_tracks[tid]
            if old_track.entry_time is not None:
                dwell_time = frame_timestamp - old_track.entry_time
                self.completed_tracks.append({
                    'track_id': tid,
                    'dwell_time': dwell_time,
                    'exit_time': frame_timestamp,
                })
                # Service event
                self.service_events.append((frame_timestamp, 1))

        # Tracks that entered (not in ROI before, now in)
        entered_ids = current_ids - previous_ids
        for tid in entered_ids:
            track = next(t for t in roi_tracks if t.track_id == tid)
            if track.entry_time is None:
                track.entry_time = frame_timestamp

        # Update current tracks
        self.current_tracks = {t.track_id: t for t in roi_tracks}

        # Calculate metrics
        queue_length = len(roi_tracks)

        # Service rate (people per minute) - based on exits in window
        cutoff = frame_timestamp - self.window_size
        recent_services = sum(1 for ts, _ in self.service_events if ts > cutoff)
        service_rate = (recent_services / self.window_size) * 60 if self.window_size > 0 else 0

        # Average dwell time
        recent_dwells = [t['dwell_time'] for t in self.completed_tracks if t['exit_time'] > cutoff]
        avg_dwell = sum(recent_dwells) / len(recent_dwells) if recent_dwells else 0

        # Estimated wait = queue_length / service_rate (if service_rate > 0)
        if service_rate > 0:
            estimated_wait = queue_length / service_rate
        else:
            # Fallback: assume 5 min per person
            estimated_wait = queue_length * 5.0

        metrics = QueueMetrics(
            counter_id=self.counter_id,
            timestamp=frame_timestamp,
            queue_length=queue_length,
            service_rate=service_rate,
            estimated_wait_min=estimated_wait,
            avg_dwell_time=avg_dwell,
            tracks_in_roi=len(roi_tracks),
            tracks_served=len(self.completed_tracks),
        )

        self.last_queue_length = queue_length
        return metrics

    def get_summary(self) -> Dict:
        """Get summary for logging/debugging."""
        return {
            "counter_id": self.counter_id,
            "current_queue": self.last_queue_length,
            "tracks_in_roi": len(self.current_tracks),
            "total_served": len(self.completed_tracks),
            "avg_dwell_sec": sum(t['dwell_time'] for t in self.completed_tracks) / len(self.completed_tracks) if self.completed_tracks else 0,
        }