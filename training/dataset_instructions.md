# RetinaGuard AI – Dataset Setup & Training Instructions

Diabetic Retinopathy datasets hosted on Kaggle require manual authentication and agreement to dataset licensing terms. Follow the beginner-friendly steps below on Windows.

---

## 1. Supported Datasets

1. **APTOS 2019 Blindness Detection** (Recommended for rapid training, ~3,662 labeled high-resolution images)
   - Kaggle URL: https://www.kaggle.com/c/aptos2019-blindness-detection/data
2. **Diabetic Retinopathy Detection (EyePACS)** (~35,126 images)
   - Kaggle URL: https://www.kaggle.com/c/diabetic-retinopathy-detection/data

---

## 2. Step-by-Step Download Guide

### Option A: APTOS 2019 (Recommended)
1. Log in to your Kaggle account in your web browser: https://www.kaggle.com
2. Navigate to the competition data page:
   `https://www.kaggle.com/c/aptos2019-blindness-detection/data`
3. Click **"I Understand and Accept"** to accept the competition dataset rules.
4. Download the following files:
   - `train.csv` (contains image `id_code` and DR `diagnosis` level 0-4)
   - `train_images.zip` (uncompressed fundus photos)
5. Extract the files into the RetinaGuard directory:
   ```text
   RetinaGuard-AI/
     dataset/
       aptos2019/
         train.csv
         train_images/
           000c14406497.png
           001639a390f0.png
           ...
   ```

### Option B: EyePACS Dataset
1. Visit: `https://www.kaggle.com/c/diabetic-retinopathy-detection/data`
2. Download:
   - `trainLabels.csv.zip` (extract to `trainLabels.csv`)
   - `train.zip` (extract to `train/`)
3. Place in:
   ```text
   RetinaGuard-AI/
     dataset/
       eyepacs/
         trainLabels.csv
         train/
           10_left.jpeg
           10_right.jpeg
           ...
   ```

---

## 3. Running Preprocessing & Training on Windows

Open PowerShell or CMD inside `RetinaGuard-AI` and activate your virtual environment:

```powershell
# 1. Activate venv
.\venv\Scripts\Activate.ps1

# 2. Train with APTOS 2019
python training/train.py --dataset_dir dataset/aptos2019 --dataset_type aptos --epochs 15 --architecture MobileNetV2

# 3. Or train with EyePACS
python training/train.py --dataset_dir dataset/eyepacs --dataset_type eyepacs --epochs 15 --architecture MobileNetV2
```

The script will:
- Apply patient-level train/validation split (ensuring identical patients never appear in both splits).
- Balance class weights across all 5 ICDR categories.
- Perform transfer learning with ImageNet weights and fine-tune top convolutional layers.
- Automatically save the optimal model weights to `models/dr_model.h5`.
- Write performance metadata to `models/model_info.json`.

---

## 4. Evaluating Model Performance

Run:
```powershell
python training/evaluate.py --weights_path models/dr_model.h5 --dataset_dir dataset/aptos2019 --dataset_type aptos
```

This will print the Confusion Matrix, Macro Accuracy, Precision, Recall, and F1-score, and save the confusion matrix visualization to `training/confusion_matrix.png`.

---

## 5. Running the Application Without Trained Weights

If you have not yet trained `models/dr_model.h5`, RetinaGuard AI safely blocks unverified predictions:
- The UI displays an amber **"AI Model Not Ready – Prediction Guard Active"** banner.
- All patient registries, historical timelines, and comparisons remain completely accessible.
- Once `models/dr_model.h5` is created by `train.py`, the system automatically detects it, changes the status to **"AI Model Ready"**, and enables live predictions with Grad-CAM overlays.
