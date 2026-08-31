import hashlib
from collections import defaultdict, deque
from threading import Lock
from time import monotonic, time_ns

import redis


class SlidingWindowLimiter:
    """Small single-process limiter for sensitive authentication endpoints.

    Production deployments can replace this with a shared Redis-backed limiter
    without changing the API contract.
    """

    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True

    def reset(self) -> None:
        """Clear in-memory counters, primarily for isolated application tests."""
        with self._lock:
            self._events.clear()


class RateLimitBackendUnavailable(RuntimeError):
    pass


class RedisSlidingWindowLimiter:
    """Atomic distributed sliding window for horizontally scaled deployments."""

    _SCRIPT = """
local key = KEYS[1]
local cutoff = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local member = ARGV[3]
local limit = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
if redis.call('ZCARD', key) >= limit then return 0 end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return 1
"""

    def __init__(self, url: str, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._client = redis.from_url(
            url,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )

    def allow(self, key: str) -> bool:
        now_ms = time_ns() // 1_000_000
        redis_key = f"razorshield:auth-limit:{hashlib.sha256(key.encode()).hexdigest()}"
        try:
            accepted = self._client.eval(
                self._SCRIPT,
                1,
                redis_key,
                now_ms - self.window_seconds * 1000,
                now_ms,
                f"{now_ms}:{time_ns()}",
                self.limit,
                self.window_seconds + 1,
            )
        except redis.RedisError as exc:
            raise RateLimitBackendUnavailable("Distributed rate limiter unavailable") from exc
        return bool(accepted)

    def reset(self) -> None:
        """No global reset is allowed for a shared production limiter."""
