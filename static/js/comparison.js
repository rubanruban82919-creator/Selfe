/**
 * RetinaGuard AI - Dual Screening Longitudinal Comparison Viewer
 */

document.addEventListener('DOMContentLoaded', () => {
    initComparisonTools();
});

function initComparisonTools() {
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const toggleHeatmapBtn = document.getElementById('toggleHeatmapBtn');

    const prevImg = document.getElementById('prevRetinaImg');
    const currImg = document.getElementById('currRetinaImg');

    if (!prevImg || !currImg) return;

    let zoomLevel = 1.0;
    const minZoom = 0.8;
    const maxZoom = 2.5;

    function applyZoom() {
        prevImg.style.transform = `scale(${zoomLevel})`;
        currImg.style.transform = `scale(${zoomLevel})`;
        const zoomDisplay = document.getElementById('currentZoomLevel');
        if (zoomDisplay) zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (zoomLevel < maxZoom) {
                zoomLevel += 0.2;
                applyZoom();
            }
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (zoomLevel > minZoom) {
                zoomLevel -= 0.2;
                applyZoom();
            }
        });
    }

    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', () => {
            zoomLevel = 1.0;
            applyZoom();
        });
    }

    // Toggle between Raw Fundus and Grad-CAM Heatmap overlay
    let showHeatmaps = false;
    if (toggleHeatmapBtn) {
        toggleHeatmapBtn.addEventListener('click', () => {
            showHeatmaps = !showHeatmaps;
            const prevOriginal = prevImg.getAttribute('data-original');
            const prevOverlay = prevImg.getAttribute('data-overlay');
            const currOriginal = currImg.getAttribute('data-original');
            const currOverlay = currImg.getAttribute('data-overlay');

            if (showHeatmaps) {
                if (prevOverlay) prevImg.src = prevOverlay;
                if (currOverlay) currImg.src = currOverlay;
                toggleHeatmapBtn.innerHTML = '<i class="bi bi-eye-fill me-1"></i> View Raw Fundus';
                toggleHeatmapBtn.classList.replace('btn-outline-info', 'btn-info');
            } else {
                if (prevOriginal) prevImg.src = prevOriginal;
                if (currOriginal) currImg.src = currOriginal;
                toggleHeatmapBtn.innerHTML = '<i class="bi bi-fire me-1"></i> View Grad-CAM Attention';
                toggleHeatmapBtn.classList.replace('btn-info', 'btn-outline-info');
            }
        });
    }
}
