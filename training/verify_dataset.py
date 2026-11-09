"""
RetinaGuard AI - APTOS 2019 Dataset Verification Script
Verifies presence, integrity, readability, and class distribution of fundus images.
"""

import os
import sys
import csv
from pathlib import Path
from collections import Counter
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent

def verify_aptos_dataset(dataset_dir=None):
    if dataset_dir is None:
        dataset_dir = BASE_DIR / "dataset" / "aptos2019"
    else:
        dataset_dir = Path(dataset_dir)

    train_csv = dataset_dir / "train.csv"
    train_images_dir = dataset_dir / "train_images"

    print("=" * 60)
    print("      RETINAGUARD AI – APTOS 2019 DATASET VERIFICATION")
    print("=" * 60)
    print(f"Dataset root: {dataset_dir}")
    print(f"Train CSV:    {train_csv}")
    print(f"Images dir:   {train_images_dir}")
    print("-" * 60)

    # 1. Check train.csv exists
    if not train_csv.exists():
        print(f"[!] ERROR: train.csv not found at {train_csv}")
        return False

    if not train_images_dir.exists():
        print(f"[!] ERROR: train_images directory not found at {train_images_dir}")
        return False

    # 2. Read train.csv
    rows = []
    with open(train_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    total_rows = len(rows)
    print(f"[+] Total records listed in train.csv: {total_rows}")

    # 3. Verify each image
    class_counts = Counter()
    missing_images = []
    corrupted_images = []
    invalid_labels = []
    valid_samples = []

    target_classes = {
        0: "No DR",
        1: "Mild DR",
        2: "Moderate DR",
        3: "Severe DR",
        4: "Proliferative DR"
    }

    print("[*] Inspecting and verifying image files...")
    for idx, r in enumerate(rows):
        id_code = r.get("id_code", "").strip()
        raw_label = r.get("diagnosis", "").strip()

        # Check label validity
        try:
            label = int(raw_label)
            if label not in target_classes:
                invalid_labels.append((id_code, raw_label))
                continue
        except ValueError:
            invalid_labels.append((id_code, raw_label))
            continue

        # Check image file existence (check .png, .jpg, .jpeg)
        img_path = None
        for ext in [".png", ".jpg", ".jpeg"]:
            candidate = train_images_dir / f"{id_code}{ext}"
            if candidate.exists():
                img_path = candidate
                break

        if not img_path:
            missing_images.append(id_code)
            continue

        # Check image file readability and dimensions
        try:
            with Image.open(img_path) as img:
                img.verify()  # verify image integrity
            # Re-open to read size (verify() can close file pointer)
            with Image.open(img_path) as img:
                w, h = img.size
                if w < 100 or h < 100:
                    corrupted_images.append((id_code, f"Resolution too low: {w}x{h}"))
                    continue
        except Exception as e:
            corrupted_images.append((id_code, str(e)))
            continue

        class_counts[label] += 1
        valid_samples.append({
            "id_code": id_code,
            "label": label,
            "path": str(img_path),
            "size": (w, h)
        })

    # Summary Statistics
    total_valid = len(valid_samples)
    print("\n" + "=" * 60)
    print("                DATASET VERIFICATION RESULTS")
    print("=" * 60)
    print(f"Total CSV records:      {total_rows}")
    print(f"Valid verified images:  {total_valid}")
    print(f"Missing images:         {len(missing_images)}")
    print(f"Corrupted images:       {len(corrupted_images)}")
    print(f"Invalid labels:         {len(invalid_labels)}")
    print(f"Target classes count:   {len(class_counts)} (Expected: 5)")
    print("-" * 60)

    print("\nTARGET CLASS DISTRIBUTION:")
    print(f"{'Class':<8} {'Category Name':<20} {'Sample Count':<15} {'Percentage':<12}")
    print("-" * 55)

    distribution_data = []
    for c in range(5):
        cnt = class_counts.get(c, 0)
        pct = (cnt / total_valid * 100.0) if total_valid > 0 else 0.0
        c_name = target_classes[c]
        print(f"{c:<8} {c_name:<20} {cnt:<15} {pct:>6.2f}%")
        distribution_data.append({
            "class": c,
            "name": c_name,
            "count": cnt,
            "percentage": round(pct, 2)
        })

    print("-" * 55)
    print(f"{'TOTAL':<28} {total_valid:<15} 100.00%")
    print("=" * 60)

    # Imbalance analysis
    counts_list = [class_counts.get(c, 0) for c in range(5)]
    min_count = min(counts_list) if counts_list else 0
    max_count = max(counts_list) if counts_list else 1
    imbalance_ratio = round(max_count / max(1, min_count), 2)
    print(f"\n[i] Class Imbalance Ratio: {imbalance_ratio}:1 (Class 0: {max_count} vs Class 3: {min_count})")
    print("[i] Dataset is severely imbalanced! Strategies required:")
    print("    1. Compute inverse class weights for loss function during training.")
    print("    2. Apply targeted data augmentation (rotations, horizontal/vertical flips) to under-represented classes.")
    print("    3. Use Stratified patient/sample splitting to maintain class proportions in train & val sets.")
    print("    4. Track Macro F1-Score and Per-Class Recall rather than simple raw accuracy.\n")

    # Save Markdown report
    report_path = BASE_DIR / "dataset" / "dataset_verification_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# RetinaGuard AI – APTOS 2019 Dataset Verification Report\n\n")
        f.write(f"- **Verification Timestamp:** {os.popen('date /t').read().strip() if os.name == 'nt' else ''}\n")
        f.write(f"- **Dataset Path:** `{dataset_dir}`\n")
        f.write(f"- **Total Listed in CSV:** {total_rows}\n")
        f.write(f"- **Valid, Uncorrupted Images:** {total_valid}\n")
        f.write(f"- **Missing Images:** {len(missing_images)}\n")
        f.write(f"- **Corrupted Images:** {len(corrupted_images)}\n")
        f.write(f"- **Invalid Labels:** {len(invalid_labels)}\n\n")
        f.write("## Target Class Distribution\n\n")
        f.write("| Class | Clinical Category | Sample Count | Percentage |\n")
        f.write("|:---:|:---|:---:|:---:|\n")
        for d in distribution_data:
            f.write(f"| {d['class']} | {d['name']} | {d['count']} | {d['percentage']}% |\n")
        f.write(f"| **Total** | **All Categories** | **{total_valid}** | **100.00%** |\n\n")
        f.write("## Handling Class Imbalance\n\n")
        f.write(f"- **Imbalance Ratio:** {imbalance_ratio}:1\n")
        f.write("- **Methodology:** Balanced Class Weighting in Loss Function + Data Augmentation on Training Split only + Stratified Validation Split.\n")

    print(f"[+] Dataset report generated at: {report_path}")
    return True

if __name__ == "__main__":
    verify_aptos_dataset()
