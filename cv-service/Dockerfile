# CV Service - Multi-stage build for smaller image
# Build stage
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30 && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=3 --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Runtime stage
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies (minimal for headless OpenCV)
RUN apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30 && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system cvuser && adduser --system --ingroup cvuser --home /home/cvuser cvuser \
    && mkdir -p /home/cvuser/.config/matplotlib /home/cvuser/.config/ultralytics \
    && chown -R cvuser:cvuser /home/cvuser /app

# Copy Python packages from builder (global site-packages)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# Copy application code
COPY --chown=cvuser:cvuser . .

USER cvuser

# YOLO will download model on first run, cache it
ENV HOME=/home/cvuser \
    MPLCONFIGDIR=/home/cvuser/.config/matplotlib \
    YOLO_CONFIG_DIR=/home/cvuser/.config/ultralytics

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import cv2; import ultralytics; print('OK')" || exit 1

CMD ["python", "main.py"]
