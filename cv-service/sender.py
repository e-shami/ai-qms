import requests
import logging
from typing import Optional
from dataclasses import dataclass

from config import settings
from analytics import QueueMetrics

logger = logging.getLogger(__name__)


@dataclass
class CVQueueUpdate:
    counter_id: str
    queue_length: int
    service_rate: float
    estimated_wait_min: float
    avg_dwell_time: float
    timestamp: float


class BackendSender:
    def __init__(self):
        self.backend_url = settings.BACKEND_URL.rstrip("/")
        self.api_key = settings.INTERNAL_API_KEY
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Internal-API-Key": self.api_key,
        })
        self.timeout = 5  # seconds

    def send_queue_update(self, metrics: QueueMetrics) -> bool:
        """Send queue metrics to backend."""
        payload = {
            "counter_id": metrics.counter_id,
            "queue_length": metrics.queue_length,
            "service_rate": metrics.service_rate,
            "estimated_wait_min": metrics.estimated_wait_min,
            "avg_dwell_time": metrics.avg_dwell_time,
            "timestamp": metrics.timestamp,
        }

        try:
            response = self.session.post(
                f"{self.backend_url}/cv/queue-update",
                json=payload,
                timeout=self.timeout,
            )
            if response.status_code == 200:
                logger.debug(f"✅ Sent CV update for {metrics.counter_id}: queue={metrics.queue_length}, rate={metrics.service_rate:.2f}/min")
                return True
            else:
                logger.warning(f"⚠️ Backend returned {response.status_code}: {response.text}")
                return False
        except requests.exceptions.Timeout:
            logger.error("❌ Backend request timeout")
            return False
        except requests.exceptions.ConnectionError:
            logger.error("❌ Backend connection error")
            return False
        except Exception as e:
            logger.error(f"❌ Failed to send queue update: {e}")
            return False

    def health_check(self) -> bool:
        """Check if backend is reachable."""
        try:
            response = self.session.get(f"{self.backend_url.replace('/api/v1', '')}/health", timeout=3)
            return response.status_code == 200
        except Exception:
            return False