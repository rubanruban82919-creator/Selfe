import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

class Config:
    """Base application configuration."""
    SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_hex(32))
    WTF_CSRF_ENABLED = True
    WTF_CSRF_SECRET_KEY = os.environ.get("WTF_CSRF_SECRET_KEY", secrets.token_hex(32))
    
    # Database
    DATABASE_PATH = BASE_DIR / "database" / "retinaguard.db"
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{DATABASE_PATH.as_posix()}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # File upload configurations
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}
    
    # Storage Paths
    UPLOAD_FOLDER = BASE_DIR / "uploads"
    ORIGINAL_FOLDER = UPLOAD_FOLDER / "original"
    HEATMAP_FOLDER = UPLOAD_FOLDER / "heatmaps"
    REPORTS_FOLDER = BASE_DIR / "reports" / "pdf"
    MODELS_FOLDER = BASE_DIR / "models"
    DATASET_FOLDER = BASE_DIR / "dataset"
    
    # Model configuration
    MODEL_WEIGHTS_PATH = MODELS_FOLDER / "dr_model.h5"
    MODEL_INFO_PATH = MODELS_FOLDER / "model_info.json"
    MODEL_ARCH = "MobileNetV2"
    NUM_CLASSES = 5
    DR_CLASSES = [
        "No Diabetic Retinopathy (No DR)",
        "Mild Diabetic Retinopathy (Mild)",
        "Moderate Diabetic Retinopathy (Moderate)",
        "Severe Diabetic Retinopathy (Severe)",
        "Proliferative Diabetic Retinopathy (PDR)"
    ]
    DR_SHORT_LABELS = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"]

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    TESTING = False

class TestingConfig(Config):
    """Testing configuration."""
    DEBUG = False
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    TESTING = False

config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
