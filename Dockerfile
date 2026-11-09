# RetinaGuard AI - Production Docker Container
# Compatible with Render, Railway, Hugging Face Spaces, GCP Cloud Run, and AWS ECS.

FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=7860 \
    KERAS_HOME=/app/keras_cache \
    TF_KERAS_HOME=/app/keras_cache

# Install system dependencies for OpenCV and image operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure storage directories exist with appropriate permissions
RUN mkdir -p /app/database /app/uploads/original /app/uploads/heatmaps /app/reports/pdf /app/keras_cache && \
    chmod -R 777 /app/database /app/uploads /app/reports /app/keras_cache

# Expose default application port (7860 for Hugging Face, overridden by Render/Railway $PORT)
EXPOSE 7860

# Launch Gunicorn with 1 worker and 4 threads to keep TensorFlow memory usage lean (~400MB-600MB)
CMD gunicorn --bind 0.0.0.0:${PORT:-7860} --workers 1 --threads 4 --timeout 180 wsgi:app
