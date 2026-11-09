"""
RetinaGuard AI - Dataset Loader & Patient-Level Splitting Module
Supports APTOS 2019 and EyePACS Diabetic Retinopathy datasets.
"""

import os
import re
import csv
import random
from pathlib import Path
from collections import Counter
import numpy as np

def extract_patient_id(filename_or_id: str) -> str:
    """
    Extracts base patient ID.
    EyePACS format: '{patient_id}_{left/right}.jpeg' -> extracts patient_id.
    APTOS 2019 format: 12-character hex ID (each row is typically unique eye/patient).
    """
    base = os.path.splitext(os.path.basename(filename_or_id))[0]
    match = re.match(r"^(\d+)_", base)
    if match:
        return match.group(1)
    return base

def load_dataset_manifest(dataset_dir: Path, dataset_type: str = "aptos"):
    """
    Loads dataset metadata CSV and maps image file paths to DR diagnosis labels.
    Returns list of dicts: [{'patient_id': str, 'image_path': str, 'label': int}]
    """
    dataset_dir = Path(dataset_dir)
    records = []

    if dataset_type.lower() == "aptos":
        csv_file = dataset_dir / "train.csv"
        img_dir = dataset_dir / "train_images"
        if not csv_file.exists():
            raise FileNotFoundError(f"APTOS train.csv not found at {csv_file}")

        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                id_code = row["id_code"]
                label = int(row["diagnosis"])
                # Match possible extensions
                for ext in [".png", ".jpg", ".jpeg"]:
                    candidate = img_dir / f"{id_code}{ext}"
                    if candidate.exists():
                        records.append({
                            "patient_id": id_code,
                            "image_path": str(candidate),
                            "label": label
                        })
                        break

    elif dataset_type.lower() == "eyepacs":
        csv_file = dataset_dir / "trainLabels.csv"
        img_dir = dataset_dir / "train"
        if not csv_file.exists():
            raise FileNotFoundError(f"EyePACS trainLabels.csv not found at {csv_file}")

        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                img_name = row["image"]
                label = int(row["level"])
                patient_id = extract_patient_id(img_name)
                for ext in [".jpeg", ".jpg", ".png"]:
                    candidate = img_dir / f"{img_name}{ext}"
                    if candidate.exists():
                        records.append({
                            "patient_id": patient_id,
                            "image_path": str(candidate),
                            "label": label
                        })
                        break

    return records

def patient_level_train_val_split(records: list, val_ratio: float = 0.2, random_seed: int = 42):
    """
    Performs patient-level splitting to prevent data leakage.
    Ensures images from the same patient NEVER appear in both training and validation sets.
    """
    random.seed(random_seed)

    # Group records by patient ID
    patients = {}
    for r in records:
        pid = r["patient_id"]
        if pid not in patients:
            patients[pid] = []
        patients[pid].append(r)

    patient_ids = list(patients.keys())
    random.shuffle(patient_ids)

    n_val = int(len(patient_ids) * val_ratio)
    val_pids = set(patient_ids[:n_val])
    train_pids = set(patient_ids[n_val:])

    train_records = []
    val_records = []

    for pid in train_pids:
        train_records.extend(patients[pid])
    for pid in val_pids:
        val_records.extend(patients[pid])

    return train_records, val_records

def compute_class_weights(records: list, num_classes: int = 5) -> dict:
    """
    Calculates balanced class weights:
    weight[c] = total_samples / (num_classes * count[c])
    """
    labels = [r["label"] for r in records]
    counts = Counter(labels)
    total = len(labels)
    weights = {}

    for c in range(num_classes):
        cnt = counts.get(c, 1)
        weights[c] = round(total / (num_classes * cnt), 4)

    return weights
