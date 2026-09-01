import cv2
import time
import signal
import sys
import logging
from typing import Optional

from config import settings
from detector import YOLODetector
from tracker import ByteTrackWrapper
from roi import ROIManager
from analytics import QueueAnalytics
from sender import BackendSender, CVQueueUpdate

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class CVService:
    def __init__(self):
        self.running = False
        self.detector = YOLODetector()
        self.tracker = ByteTrackWrapper()
        self.roi_manager = ROIManager()
        self.analytics = QueueAnalytics(settings.CAMERA_COUNTER_ID)
        self.sender = BackendSender()

        # Camera
        self.cap: Optional[cv2.VideoCapture] = None
        self.frame_count = 0
        self.last_push_time = 0

        # Visualization
        self.show_window = False  # Set True for debug window

    def setup_camera(self) -> bool:
        """Initialize camera capture."""
        source = settings.CAMERA_SOURCE

        # Try to parse as integer (USB camera index)
        try:
            source = int(source)
        except ValueError:
            pass  # Keep as string (RTSP URL or file path)

        self.cap = cv2.VideoCapture(source)
        if not self.cap.isOpened():
            logger.error(f"❌ Failed to open camera source: {settings.CAMERA_SOURCE}")
            return False

        # Set resolution and FPS
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings.CAMERA_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.CAMERA_HEIGHT)
        self.cap.set(cv2.CAP_PROP_FPS, settings.CAMERA_FPS)

        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.cap.get(cv2.CAP_PROP_FPS)

        logger.info(f"📷 Camera opened: {actual_width}x{actual_height} @ {actual_fps:.1f} FPS")
        return True

    def process_frame(self, frame: cv2.Mat) -> cv2.Mat:
        """Process a single frame through the full pipeline."""
        self.frame_count += 1

        # Frame skip
        if self.frame_count % settings.FRAME_SKIP != 0:
            return frame

        # Current timestamp
        timestamp = time.time()

        # 1. Detect
        detections = self.detector.detect(frame)

        # 2. Track (using Ultralytics built-in tracking)
        # We'll use model.track() for simplicity
        yolo_results = self.detector.model.track(
            frame,
            conf=settings.YOLO_CONF_THRESHOLD,
            iou=settings.YOLO_IOU_THRESHOLD,
            classes=settings.YOLO_CLASSES,
            tracker=settings.TRACKER_CONFIG,
            persist=True,
            verbose=False,
            device=settings.YOLO_DEVICE,
        )

        # Extract tracks from YOLO results
        tracks_data = []
        for result in yolo_results:
            boxes = result.boxes
            if boxes is None or boxes.id is None:
                continue

            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box.xyxy[i].cpu().numpy()
                conf = float(box.conf[i].cpu().numpy())
                cls_id = int(box.cls[i].cpu().numpy())
                track_id = int(box.id[i].cpu().numpy()) if box.id is not None else -1

                if track_id >= 0:
                    tracks_data.append(((x1, y1, x2, y2), conf, cls_id, track_id))

        # 3. Update our tracker wrapper
        tracks = self.tracker.update(tracks_data, self.frame_count, self.roi_manager)

        # 4. Analytics
        metrics = self.analytics.update(tracks, timestamp)

        # 5. Send to backend (throttled)
        if timestamp - self.last_push_time >= settings.PUSH_INTERVAL_SECONDS:
            self.sender.send_queue_update(metrics)
            self.last_push_time = timestamp

        # 6. Visualization (optional)
        if self.show_window:
            frame = self.roi_manager.draw_rois(frame)
            frame = self.detector.draw_detections(frame, detections)
            frame = self.tracker.draw_tracks(frame, tracks)

            # Add metrics overlay
            cv2.putText(frame, f"Queue: {metrics.queue_length}", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Rate: {metrics.service_rate:.1f}/min", (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Wait: {metrics.estimated_wait_min:.1f} min", (10, 90),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Dwell: {metrics.avg_dwell_time:.1f}s", (10, 120),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        return frame

    def run(self):
        """Main processing loop."""
        if not self.setup_camera():
            return

        logger.info("🚀 CV Service started. Press Ctrl+C to stop.")
        self.running = True

        # Signal handling
        def signal_handler(sig, frame):
            logger.info("🛑 Shutdown signal received")
            self.running = False
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            while self.running:
                ret, frame = self.cap.read()
                if not ret:
                    logger.warning("⚠️ Failed to read frame, retrying...")
                    time.sleep(0.1)
                    continue

                processed = self.process_frame(frame)

                if self.show_window:
                    cv2.imshow("AI-QMS CV Service", processed)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        break
                    elif key == ord('s'):
                        self.show_window = not self.show_window

        except Exception as e:
            logger.error(f"❌ Error in main loop: {e}", exc_info=True)
        finally:
            self.cleanup()

    def cleanup(self):
        """Clean up resources."""
        self.running = False
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()
        logger.info("👋 CV Service stopped")


def main():
    service = CVService()
    service.run()


if __name__ == "__main__":
    main()