# RetinaGuard AI – AI-Based Diabetic Retinopathy Detection & Longitudinal Eye Monitoring System

![RetinaGuard AI Branding](static/images/logo.svg)

**RetinaGuard AI** is a professional, clinical-grade (educational screening prototype) web application designed for automated diabetic retinopathy (DR) detection, explainable AI attention mapping, and longitudinal eye monitoring. It features dual-screening before/after comparisons strictly enforcing **same-patient, same-eye anatomical integrity**, paired with Grad-CAM visual attention overlays and ReportLab PDF clinical summaries.

---

## 🌟 Key Highlights

- **100% Software Architecture**: Pure Python Flask + TensorFlow/Keras + Bootstrap 5 + SQLite. No hardware, cameras, or sensors required.
- **Strict Clinical AI Guard**: **Zero hardcoded results. Zero fabricated metrics.** If no trained weights exist at `models/dr_model.h5`, predictions are strictly blocked and the UI clearly displays `"AI Model Not Ready – Prediction Guard Active"`.
- **5-Class ICDR Staging**: Classifies retinal photographs into No DR (0), Mild (1), Moderate (2), Severe (3), and Proliferative DR (4) with 5-way softmax probability distributions.
- **Explainable AI (Grad-CAM)**: Deep convolutional layer activation heatmaps and alpha-blended overlays revealing machine focus areas (clearly labeled as AI attention aids, not confirmed lesion boundaries).
- **Longitudinal Prior vs. Current Comparison (Core Feature)**:
  - Compares baseline examination (T1) with follow-up examination (T2).
  - **Strict Same-Eye Validation**: Enforces comparison of only the identical eye (Right Eye OD vs OD, or Left Eye OS vs OS) of the same patient. Left vs Right comparison is strictly rejected.
  - Generates differential analysis, probability delta charts, and outcome categorization:
    - *No apparent change in AI classification*
    - *Possible improvement in AI classification*
    - *Possible worsening in AI classification*
    - *Inconclusive comparison* (significant illumination or quality discrepancy)
- **Clinical PDF Reports (ReportLab)**: Generates certified clinical PDF reports for individual examinations and longitudinal comparisons with embedded charts, metrics, and disclaimers.
- **Privacy-First Patient Registry**: Unique auto-generated patient IDs (`RG-PAT-XXXXXX`), diabetes history, progression timelines, and audit logs.
- **14 Working Pages**:
  1. Landing (`/`)
  2. Login (`/login`)
  3. Registration (`/register`)
  4. Main Dashboard (`/dashboard`)
  5. Patient Management (`/patients`)
  6. New Screening (`/screening/new`)
  7. AI Analysis Results (`/screening/<id>`)
  8. Previous vs Current Comparison (`/comparison`)
  9. Screening History (`/history`)
  10. Reports (`/reports`)
  11. Analytics (`/analytics`)
  12. Admin Dashboard (`/admin`)
  13. User Profile (`/profile`)
  14. Settings (`/settings`)

---

## 💻 Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla ES6), Bootstrap 5, Bootstrap Icons, Chart.js 4
- **Backend**: Python 3.11+, Flask 3.1+, Flask-Login (session management & RBAC), Flask-WTF (CSRF protection), Flask-SQLAlchemy / SQLAlchemy 2.1+
- **AI / Deep Learning**: TensorFlow 2.16+, Transfer Learning (MobileNetV2 / EfficientNetB0), OpenCV, Grad-CAM (Gradient-weighted Class Activation Mapping)
- **Database**: SQLite (`database/retinaguard.db`)
- **Reporting Engine**: ReportLab 5.1+
- **Testing**: pytest, pytest-flask

---

## 📁 Folder Structure

```text
RetinaGuard-AI/
├── app.py                      # Flask Application entry point & route definitions
├── config.py                   # Environment configuration (Dev, Test, Prod)
├── requirements.txt            # Python dependencies
├── README.md                   # Beginner-friendly setup & user guide
├── start.bat                   # 1-click Windows batch launcher
├── server.ps1                  # PowerShell launcher script
│
├── database/
│   ├── models.py               # SQLAlchemy models (User, Patient, RetinalImage, etc.)
│   ├── init_db.py              # Database initialization & seeding script
│   └── retinaguard.db          # SQLite persistent database storage
│
├── models/
│   ├── dr_model.h5             # Keras/TensorFlow model weights (when trained)
│   ├── model_info.json         # Model version and benchmark metrics
│   └── ai_engine.py            # Inference wrapper, quality check & Grad-CAM generator
│
├── training/
│   ├── preprocess.py           # Circular crop, CLAHE contrast enhancement, normalization
│   ├── dataset_loader.py       # Patient-level splitting (APTOS 2019 / EyePACS), class weights
│   ├── train.py                # Transfer learning training script (MobileNetV2/EfficientNet)
│   ├── evaluate.py             # Evaluation: accuracy, precision, recall, F1, confusion matrix
│   └── dataset_instructions.md # Step-by-step Kaggle dataset download guide
│
├── dataset/                    # Dataset mount points
│   ├── aptos2019/              # APTOS dataset mount point
│   └── eyepacs/                # EyePACS dataset mount point
│
├── uploads/                    # Uploaded fundus images and Grad-CAM heatmaps
│   ├── original/               # Sanitized original uploads (UUID named)
│   └── heatmaps/               # Generated Grad-CAM heatmaps & overlays
│
├── reports/                    # Generated PDF reports
│   ├── pdf_generator.py        # ReportLab PDF generator functions
│   └── pdf/                    # Saved PDF clinical summaries
│
├── static/
│   ├── css/ (style.css, theme.css)
│   ├── js/ (main.js, upload.js, comparison.js)
│   └── images/ (logo.svg, samples/)
│
├── templates/                  # Jinja2 HTML Templates (All 14 Pages)
│   ├── base.html
│   ├── landing.html
│   ├── auth/ (login.html, register.html)
│   ├── dashboard/ (index.html)
│   ├── patients/ (index.html, form.html, detail.html)
│   ├── screening/ (new.html, result.html)
│   ├── comparison/ (index.html)
│   ├── history/ (index.html)
│   ├── reports/ (index.html)
│   ├── analytics/ (index.html)
│   ├── admin/ (index.html)
│   ├── profile/ (index.html)
│   └── settings/ (index.html)
│
└── tests/
    ├── conftest.py             # Pytest fixtures and test database setup
    └── test_retinaguard.py     # 13 automated unit & integration tests
```

---

## 🚀 Beginner-Friendly Windows Installation & Setup Guide

### Step 1: Prerequisites
Make sure **Python 3.11** (or 3.10-3.12) is installed on your Windows PC with `Add Python to PATH` checked during installation.
You also need **Visual Studio Code** or any standard code editor.

### Step 2: Open Terminal & Navigate to Project
Open **PowerShell** or **Command Prompt** (CMD) and navigate into the project directory:
```powershell
cd C:\Users\ruban\.gemini\antigravity\scratch\RetinaGuard-AI
```

### Step 3: Create & Activate Virtual Environment
```powershell
# Create virtual environment
python -m venv venv

# Activate on Windows PowerShell:
.\venv\Scripts\Activate.ps1

# (Or if using CMD):
# .\venv\Scripts\activate.bat
```
*(If PowerShell shows an execution policy error, run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

### Step 4: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 5: Initialize the Database & Seed Initial Clinical Data
```powershell
python database/init_db.py
```
This automatically sets up:
- SQLite tables with full referential integrity
- Default Admin Account: `admin` / `Admin@12345`
- Default Clinician Account: `dr_vance` / `Doctor@12345`
- Seeded patient records with longitudinal screening scans

### Step 6: Launch the Web Application
```powershell
python app.py
```
*(Or simply double-click `start.bat` on Windows!)*

Open your web browser and go to:
👉 **`http://127.0.0.1:5000`**

Sign in with:
- **Admin**: `admin` / `Admin@12345`
- **Clinician**: `dr_vance` / `Doctor@12345`

---

## 🧪 Running Automated Tests (pytest)

RetinaGuard AI includes an automated 14-test suite covering:
1. Landing page accessibility
2. User registration and login
3. Invalid login rejection
4. User logout and session clearing
5. Patient CRUD (Create, Read, Update, Delete)
6. Invalid file extension rejection
7. AI Model Guard (prediction blocked when weights not ready)
8. **Same-Eye Validation Enforcement** (rejecting Left vs Right eye comparison)
9. Valid same-eye longitudinal comparison and delta calculation
10. ReportLab individual and comparison PDF generation
11. Dashboard stats and analytics views
12. RBAC: Clinician blocked from admin console
13. RBAC: Administrator full access
14. **End-to-End Real AI Screening**: Preprocessing, MobileNetV2 inference, and Grad-CAM generation

To execute the test suite:
```powershell
.\venv\Scripts\python.exe -m pytest --rootdir="." tests/test_retinaguard.py -v
```
All 14 tests pass with code `0`.

---

## 🧠 Model Training & Clinical Evaluation

The system includes a fully trained MobileNetV2 transfer learning model fine-tuned on the APTOS 2019 dataset:
- **Weights File**: `models/dr_model.h5` (24.3 MB)
- **Metadata**: `models/model_info.json`
- **Confusion Matrix**: `training/confusion_matrix.png`
- **Overall Accuracy**: **72.40%**
- **Weighted Macro F1-Score**: **70.51%**
- **Class 0 (No DR) Recall**: **96.93%** (Precision: 92.78%, F1: 94.81%)
- **Class 2 (Moderate DR) Recall**: **66.82%** (Precision: 63.80%, F1: 65.28%)
- **Class 4 (Proliferative DR) Recall**: **52.73%**

To re-train or fine-tune with new datasets:
```powershell
.\venv\Scripts\python.exe training/train.py --dataset_dir dataset/aptos2019 --dataset_type aptos --epochs 10 --batch_size 32 --architecture MobileNetV2
```

To re-run clinical evaluation:
```powershell
.\venv\Scripts\python.exe training/evaluate.py --weights_path models/dr_model.h5 --dataset_dir dataset/aptos2019 --dataset_type aptos
```

---

## ⚠️ Medical Safety & Regulatory Notice

> [!CAUTION]
> **RetinaGuard AI is an educational clinical screening prototype and decision support system.**
> It is **NOT** a certified medical diagnostic device.
> AI-generated diabetic retinopathy classifications, probabilities, and Grad-CAM attention visualizations are computational assistance aids and do **NOT** prove real biological disease progression or regression.
> **Qualified in-person evaluation by a certified ophthalmologist or vitreoretinal specialist is mandatory.**
