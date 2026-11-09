from datetime import datetime, timezone
import secrets
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

def utc_now():
    return datetime.now(timezone.utc)

class User(UserMixin, db.Model):
    __tablename__ = "users"
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="clinician")  # 'admin' or 'clinician'
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    last_login = db.Column(db.DateTime, nullable=True)

    # Relationships
    patients = db.relationship("Patient", backref="creator", lazy="dynamic")
    screenings = db.relationship("ScreeningResult", backref="clinician", lazy="dynamic")
    activity_logs = db.relationship("ActivityLog", backref="user", lazy="dynamic")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == "admin"

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None,
        }

class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    patient_uid = db.Column(db.String(32), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(20), default="Unspecified")
    contact = db.Column(db.String(64), nullable=True)
    diabetes_type = db.Column(db.String(32), default="Type 2")
    diabetes_duration_years = db.Column(db.Integer, default=0)
    medical_notes = db.Column(db.Text, nullable=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    images = db.relationship("RetinalImage", backref="patient", lazy="dynamic", cascade="all, delete-orphan")
    screenings = db.relationship("ScreeningResult", backref="patient", lazy="dynamic", cascade="all, delete-orphan")
    comparisons = db.relationship("ImageComparison", backref="patient", lazy="dynamic", cascade="all, delete-orphan")
    reports = db.relationship("Report", backref="patient", lazy="dynamic", cascade="all, delete-orphan")

    @property
    def latest_screening(self):
        """Returns the most recent screening result."""
        return self.screenings.order_by(ScreeningResult.created_at.desc()).first()

    @staticmethod
    def generate_patient_uid():
        """Generates a unique patient identifier RG-PAT-XXXXXX."""
        token = secrets.token_hex(3).upper()
        return f"RG-PAT-{token}"

    def to_dict(self):
        return {
            "id": self.id,
            "patient_uid": self.patient_uid,
            "name": self.name,
            "age": self.age,
            "gender": self.gender,
            "contact": self.contact,
            "diabetes_type": self.diabetes_type,
            "diabetes_duration_years": self.diabetes_duration_years,
            "medical_notes": self.medical_notes,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None,
        }

class RetinalImage(db.Model):
    __tablename__ = "retinal_images"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    eye_laterality = db.Column(db.String(10), nullable=False)  # 'left' or 'right'
    filename = db.Column(db.String(255), nullable=False)
    filepath = db.Column(db.String(512), nullable=False)
    thumbnail_path = db.Column(db.String(512), nullable=True)
    file_size_kb = db.Column(db.Float, default=0.0)
    resolution_width = db.Column(db.Integer, default=0)
    resolution_height = db.Column(db.Integer, default=0)
    quality_score = db.Column(db.Float, default=85.0)  # 0 to 100
    quality_assessment = db.Column(db.String(64), default="Acceptable Quality")
    captured_date = db.Column(db.Date, nullable=True)
    uploaded_at = db.Column(db.DateTime, default=utc_now)

    # Relationships
    screenings = db.relationship("ScreeningResult", backref="image", lazy="dynamic", cascade="all, delete-orphan")

class ScreeningResult(db.Model):
    __tablename__ = "screening_results"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    image_id = db.Column(db.Integer, db.ForeignKey("retinal_images.id"), nullable=False, index=True)
    model_version = db.Column(db.String(64), default="MobileNetV2-v1.0")
    
    # 5-class predictions
    predicted_class_id = db.Column(db.Integer, nullable=False)  # 0-4
    predicted_class_label = db.Column(db.String(120), nullable=False)
    confidence_score = db.Column(db.Float, nullable=False)  # Max softmax probability
    prob_no_dr = db.Column(db.Float, default=0.0)
    prob_mild = db.Column(db.Float, default=0.0)
    prob_moderate = db.Column(db.Float, default=0.0)
    prob_severe = db.Column(db.Float, default=0.0)
    prob_proliferative = db.Column(db.Float, default=0.0)

    # Grad-CAM visualization
    gradcam_heatmap_path = db.Column(db.String(512), nullable=True)
    gradcam_overlay_path = db.Column(db.String(512), nullable=True)
    
    clinical_recommendation = db.Column(db.Text, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)

    def probabilities_dict(self):
        return {
            "No DR": round(self.prob_no_dr * 100, 2),
            "Mild": round(self.prob_mild * 100, 2),
            "Moderate": round(self.prob_moderate * 100, 2),
            "Severe": round(self.prob_severe * 100, 2),
            "Proliferative": round(self.prob_proliferative * 100, 2),
        }

class ImageComparison(db.Model):
    __tablename__ = "image_comparisons"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    eye_laterality = db.Column(db.String(10), nullable=False)  # 'left' or 'right'
    
    previous_screening_id = db.Column(db.Integer, db.ForeignKey("screening_results.id"), nullable=False)
    current_screening_id = db.Column(db.Integer, db.ForeignKey("screening_results.id"), nullable=False)
    
    classification_change_status = db.Column(db.String(64), nullable=False)
    # Allowed statuses:
    # "No apparent change in AI classification"
    # "Possible improvement in AI classification"
    # "Possible worsening in AI classification"
    # "Inconclusive comparison"

    confidence_delta = db.Column(db.Float, default=0.0)
    feature_notes = db.Column(db.Text, nullable=True)
    comparison_notes = db.Column(db.Text, nullable=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)

    # Relationships
    previous_screening = db.relationship("ScreeningResult", foreign_keys=[previous_screening_id])
    current_screening = db.relationship("ScreeningResult", foreign_keys=[current_screening_id])
    reports = db.relationship("Report", backref="comparison", lazy="dynamic", cascade="all, delete-orphan")

class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    report_type = db.Column(db.String(32), nullable=False)  # 'individual' or 'comparison'
    screening_id = db.Column(db.Integer, db.ForeignKey("screening_results.id"), nullable=True)
    comparison_id = db.Column(db.Integer, db.ForeignKey("image_comparisons.id"), nullable=True)
    
    pdf_filename = db.Column(db.String(255), nullable=False)
    pdf_filepath = db.Column(db.String(512), nullable=False)
    generated_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)

    # Relationships
    screening = db.relationship("ScreeningResult", foreign_keys=[screening_id])
    generator = db.relationship("User", foreign_keys=[generated_by_user_id])

class ModelInfo(db.Model):
    __tablename__ = "model_info"

    id = db.Column(db.Integer, primary_key=True)
    version_name = db.Column(db.String(64), nullable=False, unique=True)
    architecture = db.Column(db.String(64), nullable=False)
    weights_filename = db.Column(db.String(255), nullable=False)
    trained_date = db.Column(db.DateTime, default=utc_now)
    num_classes = db.Column(db.Integer, default=5)
    accuracy = db.Column(db.Float, nullable=True)
    precision_macro = db.Column(db.Float, nullable=True)
    recall_macro = db.Column(db.Float, nullable=True)
    f1_macro = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

class ActivityLog(db.Model):
    __tablename__ = "activity_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(64), nullable=False, index=True)
    details = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)
