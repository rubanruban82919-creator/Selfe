import os
import sys
import json
from datetime import datetime, date, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from flask import Flask
from config import config_by_name
from database.models import (
    db, User, Patient, RetinalImage, ScreeningResult,
    ImageComparison, Report, ModelInfo, ActivityLog
)

def init_database(app: Flask):
    """Initializes tables and seeds initial administrator and clinical data."""
    with app.app_context():
        # Ensure database directory exists
        db_path = Path(app.config["DATABASE_PATH"])
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        db.create_all()
        
        # 1. Seed Administrator and Clinician Users if not present
        admin_user = User.query.filter_by(username="admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@retinaguard.ai",
                full_name="Chief Medical Director (Admin)",
                role="admin",
                is_active=True
            )
            admin_user.set_password("Admin@12345")
            db.session.add(admin_user)
            print(">> Created default admin: admin / Admin@12345")
        
        doctor_user = User.query.filter_by(username="dr_vance").first()
        if not doctor_user:
            doctor_user = User(
                username="dr_vance",
                email="dr.vance@retinaguard.ai",
                full_name="Dr. Eleanor Vance, MD (Ophthalmology)",
                role="clinician",
                is_active=True
            )
            doctor_user.set_password("Doctor@12345")
            db.session.add(doctor_user)
            print(">> Created default clinician: dr_vance / Doctor@12345")

        db.session.commit()

        # 2. Seed Model Information record
        active_model = ModelInfo.query.filter_by(version_name="MobileNetV2-v1.0").first()
        if not active_model:
            model_info = ModelInfo(
                version_name="MobileNetV2-v1.0",
                architecture="MobileNetV2 (Transfer Learning with ImageNet weights)",
                weights_filename="dr_model.h5",
                trained_date=datetime.now(timezone.utc),
                num_classes=5,
                accuracy=0.924,
                precision_macro=0.912,
                recall_macro=0.908,
                f1_macro=0.910,
                is_active=True,
                notes="5-Class Diabetic Retinopathy classification model (ICDR standard: No DR, Mild, Moderate, Severe, Proliferative). Requires weights file models/dr_model.h5 to execute live predictions."
            )
            db.session.add(model_info)
            print(">> Seeded ModelInfo metadata for MobileNetV2-v1.0")

        # 3. Seed Realistic Clinical Patients & Screening History if table is empty
        if Patient.query.count() == 0:
            seed_json = BASE_DIR / "backend" / "seed_patients.json"
            if seed_json.exists():
                with open(seed_json, "r", encoding="utf-8") as f:
                    seed_data = json.load(f)
                    for item in seed_data:
                        pat = Patient(
                            patient_uid=item.get("id", Patient.generate_patient_uid()),
                            name=item.get("name"),
                            age=item.get("age", 50),
                            gender=item.get("gender", "Unspecified"),
                            contact=item.get("contact", "+1 (555) 234-5678"),
                            diabetes_type=item.get("diabetesType", "Type 2 Diabetes Mellitus"),
                            diabetes_duration_years=int(item.get("diabetesDuration", "5").split()[0]) if item.get("diabetesDuration") else 5,
                            medical_notes=item.get("clinicalNotes", ""),
                            created_by_user_id=doctor_user.id
                        )
                        db.session.add(pat)
                        db.session.flush()

                        # Add scan records if any
                        scans = item.get("scans", [])
                        prev_screening = None
                        for scan in scans:
                            laterality = "right" if "OD" in scan.get("eye", "OD") else "left"
                            stage_id = scan.get("stage", 0)
                            stage_names = [
                                "No Diabetic Retinopathy (No DR)",
                                "Mild Diabetic Retinopathy (Mild)",
                                "Moderate Diabetic Retinopathy (Moderate)",
                                "Severe Diabetic Retinopathy (Severe)",
                                "Proliferative Diabetic Retinopathy (PDR)"
                            ]
                            stage_label = stage_names[min(stage_id, 4)]
                            conf = scan.get("confidence", 95.0) / 100.0

                            # Mock probability distribution peaked around predicted class
                            probs = [0.05, 0.05, 0.05, 0.05, 0.05]
                            probs[stage_id] = conf
                            rem = (1.0 - conf) / 4.0
                            for k in range(5):
                                if k != stage_id:
                                    probs[k] = round(rem, 4)

                            # Create RetinalImage record
                            sample_img_rel = scan.get("image", "static/images/samples/retina-stage0.svg")
                            scan_date = datetime.strptime(scan.get("date", "2026-01-01"), "%Y-%m-%d").date()

                            img_rec = RetinalImage(
                                patient_id=pat.id,
                                eye_laterality=laterality,
                                filename=f"{pat.patient_uid}_{laterality}_{scan.get('id', 'scan')}.png",
                                filepath=sample_img_rel,
                                thumbnail_path=sample_img_rel,
                                file_size_kb=245.5,
                                resolution_width=1024,
                                resolution_height=1024,
                                quality_score=92.5,
                                quality_assessment="High Diagnostic Quality",
                                captured_date=scan_date
                            )
                            db.session.add(img_rec)
                            db.session.flush()

                            # Clinical recommendations based on stage
                            recs = [
                                "No DR detected. Low immediate clinical risk. Schedule standard annual diabetic eye examination.",
                                "Mild non-proliferative DR. Follow-up dilated fundus examination recommended within 6 to 12 months.",
                                "Moderate non-proliferative DR. Referral to ophthalmologist recommended for comprehensive evaluation within 3 to 6 months.",
                                "Severe non-proliferative DR. High risk of progression. Prompt vitreoretinal consultation recommended within 2 to 4 weeks.",
                                "Proliferative DR identified. Urgent ophthalmic referral required for panretinal photocoagulation or anti-VEGF therapy consideration."
                            ]

                            screening = ScreeningResult(
                                patient_id=pat.id,
                                image_id=img_rec.id,
                                model_version="MobileNetV2-v1.0",
                                predicted_class_id=stage_id,
                                predicted_class_label=stage_label,
                                confidence_score=conf,
                                prob_no_dr=probs[0],
                                prob_mild=probs[1],
                                prob_moderate=probs[2],
                                prob_severe=probs[3],
                                prob_proliferative=probs[4],
                                gradcam_heatmap_path=sample_img_rel,
                                gradcam_overlay_path=sample_img_rel,
                                clinical_recommendation=recs[stage_id],
                                created_by_user_id=doctor_user.id,
                                created_at=datetime.combine(scan_date, datetime.min.time(), tzinfo=timezone.utc)
                            )
                            db.session.add(screening)
                            db.session.flush()

                            # Seed image comparison if multiple scans exist for the same eye
                            if prev_screening and prev_screening.image.eye_laterality == laterality:
                                status = "No apparent change in AI classification"
                                if screening.predicted_class_id > prev_screening.predicted_class_id:
                                    status = "Possible worsening in AI classification"
                                elif screening.predicted_class_id < prev_screening.predicted_class_id:
                                    status = "Possible improvement in AI classification"

                                comparison = ImageComparison(
                                    patient_id=pat.id,
                                    eye_laterality=laterality,
                                    previous_screening_id=prev_screening.id,
                                    current_screening_id=screening.id,
                                    classification_change_status=status,
                                    confidence_delta=round(screening.confidence_score - prev_screening.confidence_score, 4),
                                    feature_notes=f"Comparison between {prev_screening.image.captured_date} and {screening.image.captured_date}.",
                                    comparison_notes=f"AI classification changed from {prev_screening.predicted_class_label} to {screening.predicted_class_label}. Medical confirmation required.",
                                    created_by_user_id=doctor_user.id,
                                    created_at=screening.created_at
                                )
                                db.session.add(comparison)

                            prev_screening = screening

                print(">> Seeded rich patient dataset and longitudinal screening history.")

        # 4. Add initial system activity log
        log = ActivityLog(
            user_id=admin_user.id,
            action="SYSTEM_INIT",
            details="RetinaGuard AI database initialized with clinical schemas and security policies.",
            ip_address="127.0.0.1"
        )
        db.session.add(log)
        db.session.commit()
        print(">> Database initialization complete.")

if __name__ == "__main__":
    app = Flask(__name__)
    app.config.from_object(config_by_name["development"])
    db.init_app(app)
    init_database(app)
