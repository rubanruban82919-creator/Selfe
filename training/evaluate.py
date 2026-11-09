"""
RetinaGuard AI - Model Evaluation & Clinical Metrics Module
Calculates Accuracy, Precision, Recall, F1-Score, and Confusion Matrix.
"""

import os
import sys
import json
import argparse
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report
)

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from training.dataset_loader import load_dataset_manifest, patient_level_train_val_split
from training.preprocess import preprocess_image_pipeline

DR_CLASSES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"]

def evaluate_model(weights_path: str, dataset_dir: str, dataset_type: str = "aptos"):
    """
    Evaluates trained weights on the patient-stratified validation split.
    """
    import tensorflow as tf

    weights_file = Path(weights_path)
    if not weights_file.exists():
        raise FileNotFoundError(f"Model weights not found at: {weights_file}")

    print(f"[*] Loading trained weights from: {weights_file}...")
    model = tf.keras.models.load_model(str(weights_file))

    dataset_path = Path(dataset_dir)
    print(f"[*] Loading dataset from: {dataset_path}...")
    records = load_dataset_manifest(dataset_path, dataset_type=dataset_type)
    _, val_records = patient_level_train_val_split(records, val_ratio=0.20)

    print(f"[*] Evaluating on {len(val_records)} patient-stratified validation samples...")

    y_true = []
    y_pred = []

    batch_imgs = []
    batch_lbls = []

    def flush_batch(imgs, lbls):
        if not imgs:
            return
        batch_arr = np.array(imgs, dtype=np.float32)
        batch_preds = model.predict(batch_arr, batch_size=len(imgs), verbose=0)
        batch_classes = np.argmax(batch_preds, axis=1)
        y_true.extend(lbls)
        y_pred.extend(batch_classes.tolist())

    for r in val_records:
        try:
            img = preprocess_image_pipeline(r["image_path"], target_size=(224, 224))
            batch_imgs.append(img)
            batch_lbls.append(r["label"])
            if len(batch_imgs) >= 32:
                flush_batch(batch_imgs, batch_lbls)
                batch_imgs = []
                batch_lbls = []
        except Exception as e:
            continue

    flush_batch(batch_imgs, batch_lbls)

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)

    # Compute Clinical Metrics
    acc = accuracy_score(y_true, y_pred)
    prec_macro = precision_score(y_true, y_pred, average="macro", zero_division=0)
    rec_macro = recall_score(y_true, y_pred, average="macro", zero_division=0)
    f1_macro = f1_score(y_true, y_pred, average="macro", zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3, 4])
    report = classification_report(y_true, y_pred, target_names=DR_CLASSES, output_dict=True, zero_division=0)

    print("\n" + "=" * 50)
    print("      RETINAGUARD AI – MODEL EVALUATION REPORT")
    print("=" * 50)
    print(f" Overall Accuracy:      {acc * 100:.2f}%")
    print(f" Macro Precision:       {prec_macro * 100:.2f}%")
    print(f" Macro Recall:          {rec_macro * 100:.2f}%")
    print(f" Macro F1-Score:        {f1_macro * 100:.2f}%")
    print("=" * 50)
    print("\nConfusion Matrix (Rows: Ground Truth, Cols: Predicted):")
    print(cm)

    # Plot Confusion Matrix
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=DR_CLASSES,
        yticklabels=DR_CLASSES,
        title="RetinaGuard AI – Confusion Matrix",
        ylabel="True Retinopathy Grade",
        xlabel="Predicted Retinopathy Grade"
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

    # Loop over data dimensions and create text annotations
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, format(cm[i, j], "d"),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black")
    
    fig.tight_layout()
    cm_plot_path = BASE_DIR / "training" / "confusion_matrix.png"
    plt.savefig(str(cm_plot_path), dpi=200)
    plt.close()
    print(f"[+] Confusion matrix plot saved to: {cm_plot_path}")

    # Update metadata
    info_path = BASE_DIR / "models" / "model_info.json"
    if info_path.exists():
        with open(info_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    else:
        meta = {}

    meta.update({
        "accuracy": round(float(acc), 4),
        "precision_macro": round(float(prec_macro), 4),
        "recall_macro": round(float(rec_macro), 4),
        "f1_macro": round(float(f1_macro), 4),
        "confusion_matrix": cm.tolist(),
        "evaluated_samples": len(y_true),
        "classification_report": report
    })

    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=4)
    print(f"[+] Metrics updated in: {info_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate RetinaGuard AI Model")
    parser.add_argument("--weights_path", type=str, default=str(BASE_DIR / "models" / "dr_model.h5"))
    parser.add_argument("--dataset_dir", type=str, default=str(BASE_DIR / "dataset" / "aptos2019"))
    parser.add_argument("--dataset_type", type=str, default="aptos", choices=["aptos", "eyepacs"])

    args = parser.parse_args()
    evaluate_model(args.weights_path, args.dataset_dir, args.dataset_type)
