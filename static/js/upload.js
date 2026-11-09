/**
 * RetinaGuard AI - Image Upload & Quality Pre-Check
 */

document.addEventListener('DOMContentLoaded', () => {
    initUploadZone();
});

function initUploadZone() {
    const dropzone = document.getElementById('retinaDropzone');
    const fileInput = document.getElementById('retinalImageInput');
    const previewContainer = document.getElementById('uploadPreviewContainer');
    const previewImg = document.getElementById('retinaPreviewImg');
    const fileNameSpan = document.getElementById('uploadFileName');
    const fileSizeSpan = document.getElementById('uploadFileSize');
    const removeBtn = document.getElementById('removeImageBtn');
    const submitBtn = document.getElementById('submitScreeningBtn');

    if (!dropzone || !fileInput) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'), false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearSelectedFile();
        });
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleFileSelect(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
            alert('Invalid file format. Please upload a JPEG or PNG retinal photograph.');
            return;
        }

        const maxSize = 16 * 1024 * 1024; // 16 MB
        if (file.size > maxSize) {
            alert('File exceeds 16MB limit. Please upload a smaller compressed fundus photograph.');
            return;
        }

        // Display preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            fileNameSpan.textContent = file.name;
            fileSizeSpan.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
            dropzone.classList.add('d-none');
            previewContainer.classList.remove('d-none');
            if (submitBtn) submitBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    function clearSelectedFile() {
        fileInput.value = '';
        previewImg.src = '';
        previewContainer.classList.add('d-none');
        dropzone.classList.remove('d-none');
        if (submitBtn) submitBtn.disabled = true;
    }
}
