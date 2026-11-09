import os
import cv2
import numpy as np
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
MODEL_WEIGHTS = MODELS_DIR / "dr_model.h5"

DR_CLASSES = [
    "No Diabetic Retinopathy (No DR)",
    "Mild Diabetic Retinopathy (Mild)",
    "Moderate Diabetic Retinopathy (Moderate)",
    "Severe Diabetic Retinopathy (Severe)",
    "Proliferative Diabetic Retinopathy (PDR)"
]

DR_SHORT_LABELS = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"]

CLINICAL_RECOMMENDATIONS = [
    "No DR detected. Low immediate clinical risk. Schedule standard annual diabetic eye examination.",
    "Mild non-proliferative DR. Follow-up dilated fundus examination recommended within 6 to 12 months.",
    "Moderate non-proliferative DR. Referral to ophthalmologist recommended for comprehensive evaluation within 3 to 6 months.",
    "Severe non-proliferative DR. High risk of progression. Prompt vitreoretinal consultation recommended within 2 to 4 weeks.",
    "Proliferative DR identified. Urgent ophthalmic referral required for panretinal photocoagulation or anti-VEGF therapy consideration."
]

_CACHED_MODEL = None

def check_model_ready():
    """
    Checks if a trained model weight file is available.
    Returns (is_ready: bool, status_message: str).
    """
    if not MODEL_WEIGHTS.exists():
        return (
            False,
            "AI model not ready. No trained model weights found at models/dr_model.h5. "
            "Please train the model via the Training Module or upload valid model weights."
        )
    if os.path.getsize(MODEL_WEIGHTS) < 1024:
        return (
            False,
            "AI model weights file appears corrupted or empty (size < 1KB)."
        )
    return True, "Model weights loaded and operational (MobileNetV2 Transfer Learning)."

def get_model():
    """
    Loads and caches the Keras model when weights exist.
    Raises RuntimeError if model file is absent.
    """
    global _CACHED_MODEL
    ready, msg = check_model_ready()
    if not ready:
        raise RuntimeError(msg)

    if _CACHED_MODEL is not None:
        return _CACHED_MODEL

    try:
        import tensorflow as tf
        _CACHED_MODEL = tf.keras.models.load_model(str(MODEL_WEIGHTS))
        return _CACHED_MODEL
    except ImportError:
        raise RuntimeError("TensorFlow is not installed in the environment. Please install tensorflow to load model.")
    except Exception as e:
        raise RuntimeError(f"Failed to load AI model weights: {str(e)}")

def assess_image_quality(image_path: str):
    """
    Validates fundus image quality using OpenCV metrics:
    - Laplacian variance (focus/blur detection)
    - Mean luminance & dynamic range (illumination check)
    - Resolution boundaries (minimum diagnostic resolution)
    
    Returns: dict(
        is_acceptable=bool,
        score=float (0-100),
        status=str,
        metrics=dict
    )
    """
    img = cv2.imread(str(image_path))
    if img is None:
        return {
            "is_acceptable": False,
            "score": 0.0,
            "status": "Invalid or unreadable image file",
            "metrics": {}
        }

    h, w, c = img.shape
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Sharpness / Blur estimation
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_score = min(100.0, (laplacian_var / 150.0) * 100.0)

    # 2. Illumination / Brightness
    mean_brightness = float(np.mean(gray))
    # Optimal fundus brightness typically between 30 and 200
    if mean_brightness < 20:
        brightness_penalty = 50.0  # severely underexposed
    elif mean_brightness > 235:
        brightness_penalty = 50.0  # severely washed out
    else:
        brightness_penalty = 0.0

    # 3. Resolution validation (minimum 224x224, ideal > 512x512)
    res_score = 100.0 if (h >= 512 and w >= 512) else (70.0 if (h >= 224 and w >= 224) else 30.0)

    # Composite score
    composite_score = max(5.0, min(100.0, (blur_score * 0.45) + (res_score * 0.35) + ((100.0 - brightness_penalty) * 0.20)))
    composite_score = round(composite_score, 1)

    if composite_score >= 80.0:
        status = "High Diagnostic Quality"
        acceptable = True
    elif composite_score >= 55.0:
        status = "Acceptable Diagnostic Quality"
        acceptable = True
    elif composite_score >= 35.0:
        status = "Suboptimal Quality (Assessment with Caution)"
        acceptable = True
    else:
        status = "Poor Quality / Severe Blur or Underexposure"
        acceptable = False

    return {
        "is_acceptable": acceptable,
        "score": composite_score,
        "status": status,
        "metrics": {
            "width": w,
            "height": h,
            "laplacian_var": round(laplacian_var, 2),
            "mean_brightness": round(mean_brightness, 2)
        }
    }

def preprocess_retinal_image(image_path: str, target_size=(224, 224)):
    """
    Standardizes fundus image using the SAME pipeline as training:
    1. Circular crop to remove black borders
    2. CLAHE contrast enhancement in LAB space
    3. Resize to target dimension
    4. Convert BGR -> RGB
    5. Normalize pixel values to [0.0, 1.0]

    IMPORTANT: Must match training/preprocess.py pipeline exactly to avoid train-test mismatch.
    """
    import sys
    sys.path.insert(0, str(BASE_DIR))
    from training.preprocess import preprocess_image_pipeline

    norm = preprocess_image_pipeline(str(image_path), target_size=target_size, enhance_contrast=True)
    # norm is float32 RGB [0,1] — reconstruct uint8 RGB for visualization
    orig_rgb = (norm * 255.0).clip(0, 255).astype(np.uint8)
    return orig_rgb, np.expand_dims(norm, axis=0)

def generate_gradcam_overlay(model, img_array, original_rgb, heatmap_dest: Path, overlay_dest: Path):
    """
    Extracts Grad-CAM activation from the last convolutional feature extractor layer.
    Supports both nested transfer-learning models (e.g. MobileNetV2 backbone) and standard CNNs.
    Saves heatmap and overlay into disk destinations.
    """
    import tensorflow as tf

    # Find the backbone feature extractor layer (4D output shape: batch, height, width, channels)
    backbone_layer = None
    for layer in model.layers:
        if len(getattr(layer, "output_shape", [])) == 4 and layer.__class__.__name__ not in ["InputLayer"]:
            backbone_layer = layer
            break

    if backbone_layer is None:
        raise ValueError("Could not find a 4D feature map layer for Grad-CAM.")

    head_layers = model.layers[model.layers.index(backbone_layer) + 1:]

    with tf.GradientTape() as tape:
        conv_outputs = backbone_layer(img_array)
        tape.watch(conv_outputs)
        x = conv_outputs
        for layer in head_layers:
            x = layer(x)
        predictions = x
        pred_index = tf.argmax(predictions[0])
        class_channel = predictions[:, pred_index]

    grads = tape.gradient(class_channel, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    conv_outputs_0 = conv_outputs[0]
    heatmap = conv_outputs_0 @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    heatmap = tf.maximum(heatmap, 0) / (tf.math.reduce_max(heatmap) + 1e-10)
    heatmap_np = heatmap.numpy()

    # Resize heatmap to original RGB image dimensions
    orig_h, orig_w = original_rgb.shape[:2]
    heatmap_resized = cv2.resize(heatmap_np, (orig_w, orig_h))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)

    # Convert original RGB to BGR for OpenCV overlay blending
    orig_bgr = cv2.cvtColor(original_rgb, cv2.COLOR_RGB2BGR)
    overlay = cv2.addWeighted(orig_bgr, 0.65, heatmap_color, 0.35, 0)

    # Save files
    heatmap_dest.parent.mkdir(parents=True, exist_ok=True)
    overlay_dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(heatmap_dest), heatmap_color)
    cv2.imwrite(str(overlay_dest), overlay)

def run_ai_screening(image_path: str, heatmap_out_path: Path, overlay_out_path: Path):
    """
    Executes complete AI screening:
    1. Checks if model is ready (STRICT: no fake predictions)
    2. Quality assessment
    3. Model inference
    4. Grad-CAM generation
    """
    ready, msg = check_model_ready()
    if not ready:
        raise RuntimeError(msg)

    model = get_model()
    orig_rgb, img_tensor = preprocess_retinal_image(image_path)
    
    preds = model.predict(img_tensor, verbose=0)[0]
    pred_class_id = int(np.argmax(preds))
    confidence = float(preds[pred_class_id])

    # Generate Grad-CAM heatmaps
    try:
        generate_gradcam_overlay(model, img_tensor, orig_rgb, heatmap_out_path, overlay_out_path)
    except Exception as e:
        print(f"[Warning] Grad-CAM generation encountered issue: {e}")

    return {
        "predicted_class_id": pred_class_id,
        "predicted_class_label": DR_CLASSES[pred_class_id],
        "confidence_score": round(confidence, 4),
        "probabilities": [float(p) for p in preds],
        "recommendation": CLINICAL_RECOMMENDATIONS[pred_class_id]
    }
