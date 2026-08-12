import time
from collections import defaultdict, deque
from threading import Lock

from app.config import settings


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            window = self._hits[key]
            while window and now - window[0] > self.window_seconds:
                window.popleft()
            if len(window) >= self.limit:
                return False
            window.append(now)
            return True


login_limiter = SlidingWindowLimiter(
    settings.LOGIN_RATE_LIMIT, settings.LOGIN_RATE_WINDOW_SECONDS
)