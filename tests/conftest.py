import sys
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app import create_app
from database.models import db, User, Patient, RetinalImage, ScreeningResult, ImageComparison

@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()

        # Seed admin and clinician for tests
        admin = User(
            username="admin_test",
            email="admin@test.com",
            full_name="Test Admin",
            role="admin",
            is_active=True
        )
        admin.set_password("Admin@12345")
        db.session.add(admin)

        doctor = User(
            username="doctor_test",
            email="doctor@test.com",
            full_name="Dr. Test MD",
            role="clinician",
            is_active=True
        )
        doctor.set_password("Doctor@12345")
        db.session.add(doctor)

        # Seed sample patient
        patient = Patient(
            patient_uid="RG-PAT-TEST01",
            name="Alice Test",
            age=52,
            gender="Female",
            contact="+15551234567",
            diabetes_type="Type 2 Diabetes Mellitus",
            diabetes_duration_years=8,
            created_by_user_id=doctor.id
        )
        db.session.add(patient)
        db.session.commit()

        yield app

        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def clinician_client(client):
    # Log in as clinician
    client.post("/login", data={
        "username": "doctor_test",
        "password": "Doctor@12345"
    }, follow_redirects=True)
    return client

@pytest.fixture
def admin_client(client):
    # Ensure any prior session is cleared
    client.get("/logout")
    # Log in as admin
    client.post("/login", data={
        "username": "admin_test",
        "password": "Admin@12345"
    }, follow_redirects=True)
    return client
