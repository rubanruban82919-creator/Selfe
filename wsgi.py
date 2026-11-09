"""
RetinaGuard AI - Production WSGI Application Entry Point
Compatible with Gunicorn, Waitress, uWSGI, and PaaS hosts (Render, Railway, Hugging Face).
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Ensure Keras cache points to writable directory in container / host
CACHE_DIR = BASE_DIR / "keras_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("KERAS_HOME", str(CACHE_DIR))
os.environ.setdefault("TF_KERAS_HOME", str(CACHE_DIR))

from app import create_app
from database.init_db import init_database

# Determine configuration environment
env = os.environ.get("FLASK_ENV", "production")
app = create_app(env)

# Initialize database schema and seed defaults on startup
with app.app_context():
    init_database(app)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
