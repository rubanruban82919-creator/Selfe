"""
RetinaGuard AI - Fundus Image Preprocessing Module
Includes circular crop, CLAHE contrast enhancement, and normalization.
"""

import cv2
import numpy as np
from pathlib import Path

def circular_crop_fundus(image: np.ndarray, tolerance: int = 10) -> np.ndarray:
    """
    Crops the black border around the retinal fundus circle.
    """
    if image is None:
        return None
    
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    mask = gray > tolerance

    # Check if mask has content
    if not np.any(mask):
        return image

    # Find bounding box of non-black pixels
    row_sums = np.sum(mask, axis=1)
    col_sums = np.sum(mask, axis=0)
    
    non_zero_rows = np.where(row_sums > 0)[0]
    non_zero_cols = np.where(col_sums > 0)[0]
    
    if len(non_zero_rows) == 0 or len(non_zero_cols) == 0:
        return image

    r_min, r_max = non_zero_rows[0], non_zero_rows[-1]
    c_min, c_max = non_zero_cols[0], non_zero_cols[-1]

    cropped = image[r_min:r_max + 1, c_min:c_max + 1]
    return cropped

def apply_clahe(image: np.ndarray, clip_limit: float = 2.0, tile_grid_size=(8, 8)) -> np.ndarray:
    """
    Applies Contrast Limited Adaptive Histogram Equalization (CLAHE)
    in the LAB color space to enhance microaneurysms and hard exudates.
    """
    if image is None:
        return None

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    cl = clahe.apply(l_channel)

    merged = cv2.merge((cl, a_channel, b_channel))
    enhanced = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
    return enhanced

def preprocess_image_pipeline(image_path: str, target_size=(224, 224), enhance_contrast: bool = True) -> np.ndarray:
    """
    Complete fundus preprocessing pipeline:
    1. Load image
    2. Circular crop
    3. CLAHE enhancement
    4. Resize to target dimension
    5. Convert to RGB float32 normalized to [0, 1]
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"Could not read fundus image from: {image_path}")

    # Step 1: Crop black border
    cropped = circular_crop_fundus(img)

    # Step 2: Contrast enhancement
    if enhance_contrast:
        enhanced = apply_clahe(cropped)
    else:
        enhanced = cropped

    # Step 3: Resize
    resized = cv2.resize(enhanced, target_size, interpolation=cv2.INTER_AREA)

    # Step 4: BGR -> RGB
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

    # Step 5: Normalize
    norm = rgb.astype(np.float32) / 255.0
    return norm
