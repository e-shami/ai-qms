# CV Service - Multi-stage build for smaller image
# Build stage
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Runtime stage
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system cvuser && adduser --system --ingroup cvuser cvuser

# Copy Python packages from builder
COPY --from=builder /root/.local /home/cvuser/.local

# Copy application code
COPY --chown=cvuser:cvuser . .

# Ensure PATH includes user packages
ENV PATH=/home/cvuser/.local/bin:$PATH

USER cvuser

# YOLO will download model on first run, cache it
ENV YOLO_CONFIG_DIR=/home/cvuser/.config/ultralytics

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import cv2; import ultralytics; print('OK')" || exit 1

CMD ["python", "main.py"]