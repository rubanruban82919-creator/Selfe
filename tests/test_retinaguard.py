import io
import os
import pytest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
from database.models import db, User, Patient, RetinalImage, ScreeningResult, ImageComparison, Report
from models.ai_engine import check_model_ready, assess_image_quality
from reports.pdf_generator import generate_individual_screening_pdf, generate_longitudinal_comparison_pdf

# 1. Landing & Public Views
def test_landing_page_accessible(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"RetinaGuard AI" in res.data
    assert b"Access Clinician Portal" in res.data

# 2. Registration, Login, Logout
def test_user_registration_and_login(client):
    # Register new clinician
    reg_res = client.post("/register", data={
        "full_name": "Dr. Sarah Conner",
        "username": "dr_conner",
        "email": "conner@eyecare.org",
        "role": "clinician",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!"
    }, follow_redirects=True)
    assert reg_res.status_code == 200
    assert b"Account registered successfully" in reg_res.data

    # Sign in
    login_res = client.post("/login", data={
        "username": "dr_conner",
        "password": "SecurePassword123!"
    }, follow_redirects=True)
    assert login_res.status_code == 200
    assert b"Welcome back" in login_res.data
    assert b"Clinical Overview Dashboard" in login_res.data

def test_login_invalid_credentials(client):
    res = client.post("/login", data={
        "username": "doctor_test",
        "password": "WrongPassword999!"
    }, follow_redirects=True)
    assert res.status_code == 200
    assert b"Invalid clinical username or password" in res.data

def test_user_logout(clinician_client):
    res = clinician_client.get("/logout", follow_redirects=True)
    assert res.status_code == 200
    assert b"signed out securely" in res.data

# 3. Patient Management CRUD
def test_patient_crud(clinician_client):
    # Create patient
    create_res = clinician_client.post("/patients/new", data={
        "name": "David Martinez",
        "age": "61",
        "gender": "Male",
        "contact": "+1 (555) 987-6543",
        "diabetes_type": "Type 2 Diabetes Mellitus",
        "diabetes_duration_years": "12",
        "medical_notes": "Mild non-proliferative retinopathy in right eye diagnosed in 2024."
    }, follow_redirects=True)
    assert create_res.status_code == 200
    assert b"David Martinez" in create_res.data
    assert b"RG-PAT-" in create_res.data

    # Query DB
    patient = Patient.query.filter_by(name="David Martinez").first()
    assert patient is not None
    assert patient.patient_uid.startswith("RG-PAT-")
    assert patient.age == 61

    # Edit patient
    edit_res = clinician_client.post(f"/patients/{patient.id}/edit", data={
        "name": "David Martinez Jr.",
        "age": "62",
        "gender": "Male",
        "contact": "+1 (555) 987-6543",
        "diabetes_type": "Type 2 Diabetes Mellitus",
        "diabetes_duration_years": "13",
        "medical_notes": "Updated notes."
    }, follow_redirects=True)
    assert edit_res.status_code == 200
    assert b"David Martinez Jr." in edit_res.data

    # Delete patient
    del_res = clinician_client.post(f"/patients/{patient.id}/delete", follow_redirects=True)
    assert del_res.status_code == 200
    assert Patient.query.get(patient.id) is None

# 4. Image Upload & Validation
def test_invalid_file_extension_rejected(clinician_client):
    patient = Patient.query.first()
    data = {
        "patient_id": str(patient.id),
        "eye_laterality": "right",
        "captured_date": "2026-11-08",
        "retinal_image": (io.BytesIO(b"fake-executable-content"), "virus.exe")
    }
    res = clinician_client.post("/screening/run", data=data, content_type="multipart/form-data", follow_redirects=True)
    assert res.status_code == 200
    assert b"Invalid file extension" in res.data or b"model not ready" in res.data

# 5. AI Prediction Guard (Strict Requirement)
def test_ai_model_guard_blocks_prediction_when_not_ready(clinician_client):
    # When models/dr_model.h5 is absent, predictions MUST be blocked
    patient = Patient.query.first()
    ready, msg = check_model_ready()
    if not ready:
        data = {
            "patient_id": str(patient.id),
            "eye_laterality": "right",
            "captured_date": "2026-11-08",
            "retinal_image": (io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100), "sample.jpg")
        }
        res = clinician_client.post("/screening/run", data=data, content_type="multipart/form-data", follow_redirects=True)
        assert res.status_code == 200
        assert b"AI model not ready" in res.data

# 6. Longitudinal Comparison & Same-Eye Validation
def test_same_eye_validation_enforcement(clinician_client):
    patient = Patient.query.first()
    
    # Create two retinal images: one OD (right) and one OS (left)
    img_right = RetinalImage(
        patient_id=patient.id,
        eye_laterality="right",
        filename="od_test.jpg",
        filepath="static/images/samples/retina-stage1.svg",
        thumbnail_path="static/images/samples/retina-stage1.svg"
    )
    img_left = RetinalImage(
        patient_id=patient.id,
        eye_laterality="left",
        filename="os_test.jpg",
        filepath="static/images/samples/retina-stage2.svg",
        thumbnail_path="static/images/samples/retina-stage2.svg"
    )
    db.session.add_all([img_right, img_left])
    db.session.flush()

    s_right = ScreeningResult(
        patient_id=patient.id,
        image_id=img_right.id,
        model_version="MobileNetV2-v1.0",
        predicted_class_id=1,
        predicted_class_label="Mild Diabetic Retinopathy (Mild)",
        confidence_score=0.95,
        gradcam_heatmap_path="static/images/samples/retina-stage1.svg",
        gradcam_overlay_path="static/images/samples/retina-stage1.svg",
        clinical_recommendation="Follow-up in 6 months."
    )
    s_left = ScreeningResult(
        patient_id=patient.id,
        image_id=img_left.id,
        model_version="MobileNetV2-v1.0",
        predicted_class_id=2,
        predicted_class_label="Moderate Diabetic Retinopathy (Moderate)",
        confidence_score=0.96,
        gradcam_heatmap_path="static/images/samples/retina-stage2.svg",
        gradcam_overlay_path="static/images/samples/retina-stage2.svg",
        clinical_recommendation="Follow-up in 3 months."
    )
    db.session.add_all([s_right, s_left])
    db.session.commit()

    # Attempting to compare Left Eye vs Right Eye MUST fail with strict validation error!
    res = clinician_client.get(f"/comparison?patient_id={patient.id}&previous_id={s_right.id}&current_id={s_left.id}", follow_redirects=True)
    assert res.status_code == 200
    assert b"Cannot compare Left Eye with Right Eye" in res.data

# 7. Valid Same-Eye Longitudinal Comparison
def test_valid_same_eye_comparison(clinician_client):
    patient = Patient.query.first()
    
    img1 = RetinalImage(
        patient_id=patient.id,
        eye_laterality="right",
        filename="od_t1.jpg",
        filepath="static/images/samples/retina-stage1.svg",
        thumbnail_path="static/images/samples/retina-stage1.svg"
    )
    img2 = RetinalImage(
        patient_id=patient.id,
        eye_laterality="right",
        filename="od_t2.jpg",
        filepath="static/images/samples/retina-stage2.svg",
        thumbnail_path="static/images/samples/retina-stage2.svg"
    )
    db.session.add_all([img1, img2])
    db.session.flush()

    s1 = ScreeningResult(
        patient_id=patient.id,
        image_id=img1.id,
        model_version="MobileNetV2-v1.0",
        predicted_class_id=1,
        predicted_class_label="Mild Diabetic Retinopathy (Mild)",
        confidence_score=0.92,
        prob_no_dr=0.05, prob_mild=0.92, prob_moderate=0.01, prob_severe=0.01, prob_proliferative=0.01,
        gradcam_heatmap_path="static/images/samples/retina-stage1.svg",
        gradcam_overlay_path="static/images/samples/retina-stage1.svg",
        clinical_recommendation="Follow up."
    )
    s2 = ScreeningResult(
        patient_id=patient.id,
        image_id=img2.id,
        model_version="MobileNetV2-v1.0",
        predicted_class_id=2,
        predicted_class_label="Moderate Diabetic Retinopathy (Moderate)",
        confidence_score=0.95,
        prob_no_dr=0.01, prob_mild=0.02, prob_moderate=0.95, prob_severe=0.01, prob_proliferative=0.01,
        gradcam_heatmap_path="static/images/samples/retina-stage2.svg",
        gradcam_overlay_path="static/images/samples/retina-stage2.svg",
        clinical_recommendation="Follow up."
    )
    db.session.add_all([s1, s2])
    db.session.commit()

    # Compare same eye OD vs OD
    res = clinician_client.get(f"/comparison?patient_id={patient.id}&previous_id={s1.id}&current_id={s2.id}", follow_redirects=True)
    assert res.status_code == 200
    assert b"Possible worsening in AI classification" in res.data
    assert b"Synchronized Side-by-Side" in res.data

# 8. ReportLab PDF Generation
def test_pdf_report_generation(app):
    with app.app_context():
        patient = Patient.query.first()
        img = RetinalImage(
            patient_id=patient.id,
            eye_laterality="right",
            filename="pdf_test.jpg",
            filepath="static/images/samples/retina-stage1.svg",
            thumbnail_path="static/images/samples/retina-stage1.svg"
        )
        db.session.add(img)
        db.session.flush()

        scr = ScreeningResult(
            patient_id=patient.id,
            image_id=img.id,
            model_version="MobileNetV2-v1.0",
            predicted_class_id=2,
            predicted_class_label="Moderate Diabetic Retinopathy (Moderate)",
            confidence_score=0.94,
            prob_no_dr=0.02, prob_mild=0.03, prob_moderate=0.94, prob_severe=0.005, prob_proliferative=0.005,
            gradcam_heatmap_path="static/images/samples/retina-stage2.svg",
            gradcam_overlay_path="static/images/samples/retina-stage2.svg",
            clinical_recommendation="Consult ophthalmologist within 3 months."
        )
        db.session.add(scr)
        db.session.commit()

        # Generate individual PDF
        test_pdf_out = Path(app.config["REPORTS_FOLDER"]) / f"test_individual_{scr.id}.pdf"
        generate_individual_screening_pdf(scr, test_pdf_out)
        assert test_pdf_out.exists()
        assert test_pdf_out.stat().st_size > 1000

        # Create comparison record
        comp = ImageComparison(
            patient_id=patient.id,
            eye_laterality="right",
            previous_screening_id=scr.id,
            current_screening_id=scr.id,
            classification_change_status="No apparent change in AI classification",
            confidence_delta=0.0,
            comparison_notes="Identical comparison."
        )
        db.session.add(comp)
        db.session.commit()

        # Generate comparison PDF
        test_comp_pdf = Path(app.config["REPORTS_FOLDER"]) / f"test_comp_{comp.id}.pdf"
        generate_longitudinal_comparison_pdf(comp, test_comp_pdf)
        assert test_comp_pdf.exists()
        assert test_comp_pdf.stat().st_size > 1000

        # Clean up test files
        if test_pdf_out.exists(): test_pdf_out.unlink()
        if test_comp_pdf.exists(): test_comp_pdf.unlink()

# 9. Dashboard Stats & Analytics
def test_dashboard_and_analytics_views(clinician_client):
    dash_res = clinician_client.get("/dashboard")
    assert dash_res.status_code == 200
    assert b"Registered Patients" in dash_res.data
    assert b"Retinal Screenings" in dash_res.data

    analytics_res = clinician_client.get("/analytics")
    assert analytics_res.status_code == 200
    assert b"Active AI Model Performance Benchmarks" in analytics_res.data
    assert b"DR Severity Proportions" in analytics_res.data

# 10. Role-Based Access Control (Admin vs Clinician)
def test_rbac_clinician_blocked_from_admin(clinician_client):
    # Clinician should be blocked from /admin
    cli_res = clinician_client.get("/admin", follow_redirects=True)
    assert b"Administrator clearance required" in cli_res.data

def test_rbac_admin_allowed_access(admin_client):
    # Admin should have full access to /admin
    adm_res = admin_client.get("/admin")
    assert adm_res.status_code == 200
    assert b"System Administration & Governance" in adm_res.data
    assert b"User Access & Role-Based Control" in adm_res.data

# 11. End-to-End Real AI Screening with Model
def test_end_to_end_ai_screening(clinician_client):
    patient = Patient.query.first()
    # Read a sample real fundus image from dataset
    dataset_img = list((BASE_DIR / "dataset" / "aptos2019" / "train_images").glob("*.png"))[0]
    with open(dataset_img, "rb") as f:
        img_bytes = f.read()

    data = {
        "patient_id": str(patient.id),
        "eye_laterality": "right",
        "captured_date": "2026-11-09",
        "retinal_image": (io.BytesIO(img_bytes), "fundus_sample.png")
    }
    res = clinician_client.post("/screening/run", data=data, content_type="multipart/form-data", follow_redirects=True)
    assert res.status_code == 200
    # Must display analysis results page with predicted class and recommendation
    assert b"AI Analysis Results" in res.data or b"Screening Result" in res.data or b"Diabetic Retinopathy" in res.data
    assert b"Confidence Score" in res.data or b"confidence" in res.data.lower()

