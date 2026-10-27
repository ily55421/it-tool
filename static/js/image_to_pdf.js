var ImageToPDFConverter = class ImageToPDFConverter {
    constructor() {
        this.currentImage = null;
        this.currentRotation = 0;
        this.originalFileName = '';

        this.initializeEventListeners();
        this.setupDragAndDrop();
    }

    initializeEventListeners() {
        document.getElementById('browseBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files);
            e.target.value = '';
        });

        document.getElementById('rotateLeft').addEventListener('click', () => {
            this.rotateImage(-90);
        });

        document.getElementById('rotateRight').addEventListener('click', () => {
            this.rotateImage(90);
        });

        document.getElementById('rotateCustom').addEventListener('click', () => {
            this.showCustomRotationModal();
        });

        document.getElementById('resetRotation').addEventListener('click', () => {
            this.resetRotation();
        });

        document.getElementById('applyCustomRotation').addEventListener('click', () => {
            this.applyCustomRotation();
        });

        document.getElementById('cancelCustomRotation').addEventListener('click', () => {
            this.hideCustomRotationModal();
        });

        document.getElementById('convertBtn').addEventListener('click', () => {
            this.convertToPDF();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearAll();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('customAngle').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.applyCustomRotation();
            }
        });
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('uploadArea');

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.remove('drag-over');
            }, false);
        });

        uploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            this.handleImageUpload(files);
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleImageUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        
        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件');
            return;
        }

        this.originalFileName = file.name.replace(/\.[^/.]+$/, '');
        document.getElementById('outputFilename').value = this.originalFileName;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImage = e.target.result;
            this.currentRotation = 0;
            this.updateImageInfo(file);
            this.updatePreview();
            this.showControls();
        };
        reader.readAsDataURL(file);
    }

    updateImageInfo(file) {
        const img = new Image();
        img.onload = () => {
            document.getElementById('infoFilename').textContent = file.name;
            document.getElementById('infoDimensions').textContent = `${img.width} × ${img.height} px`;
            document.getElementById('infoSize').textContent = this.formatFileSize(file.size);
            document.getElementById('imageInfo').classList.remove('hidden');
        };
        img.src = this.currentImage;
    }

    showControls() {
        document.getElementById('rotationControls').classList.remove('hidden');
        document.getElementById('outputControls').classList.remove('hidden');
        document.getElementById('actionButtons').classList.remove('hidden');
    }

    rotateImage(degrees) {
        this.currentRotation = (this.currentRotation + degrees) % 360;
        this.updateRotationDisplay();
        this.updatePreview();
    }

    resetRotation() {
        this.currentRotation = 0;
        this.updateRotationDisplay();
        this.updatePreview();
    }

    updateRotationDisplay() {
        document.getElementById('rotationValue').textContent = `${this.currentRotation}°`;
    }

    showCustomRotationModal() {
        document.getElementById('customAngle').value = 0;
        document.getElementById('customRotationModal').classList.remove('hidden');
        document.getElementById('customAngle').focus();
    }

    hideCustomRotationModal() {
        document.getElementById('customRotationModal').classList.add('hidden');
    }

    applyCustomRotation() {
        const angle = parseInt(document.getElementById('customAngle').value) || 0;
        this.currentRotation = angle % 360;
        this.updateRotationDisplay();
        this.updatePreview();
        this.hideCustomRotationModal();
    }

    async updatePreview() {
        if (!this.currentImage) return;

        this.showLoading('生成预览...');

        try {
            const base64Data = this.currentImage.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const formData = new FormData();
            formData.append('image', blob, 'preview.png');
            formData.append('rotation', this.currentRotation);

            const response = await fetch('/preview-image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.displayPreview(data.preview, data.width, data.height);
            }
        } catch (error) {
            console.error('Preview error:', error);
            this.displayPreviewFallback();
        } finally {
            this.hideLoading();
        }
    }

    displayPreview(previewUrl, width, height) {
        const container = document.getElementById('previewContainer');
        const dimensions = document.getElementById('previewDimensions');

        dimensions.textContent = `${width} × ${height} px`;

        container.innerHTML = `<img src="${previewUrl}" class="preview-image" alt="预览">`;
    }

    displayPreviewFallback() {
        const container = document.getElementById('previewContainer');
        const dimensions = document.getElementById('previewDimensions');

        dimensions.textContent = '-';

        container.innerHTML = `
            <img src="${this.currentImage}" class="preview-image" alt="预览" 
                 style="transform: rotate(${this.currentRotation}deg);">
        `;
    }

    async convertToPDF() {
        if (!this.currentImage) {
            alert('请先上传图片');
            return;
        }

        const filename = document.getElementById('outputFilename').value.trim();
        if (!filename) {
            alert('请输入文件名');
            return;
        }

        this.showLoading('转换为 PDF...');

        try {
            const base64Data = this.currentImage.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const formData = new FormData();
            formData.append('image', blob, 'image.png');
            formData.append('rotation', this.currentRotation);
            formData.append('filename', `${filename}.pdf`);

            const response = await fetch('/convert-image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccessModal(data.filename, data.download_url);
            } else {
                alert('转换失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            console.error('Convert error:', error);
            alert('转换失败，请重试');
        } finally {
            this.hideLoading();
        }
    }

    showSuccessModal(filename, downloadUrl) {
        document.getElementById('downloadLink').href = downloadUrl;
        document.getElementById('downloadLink').textContent = `📥 下载 "${filename}"`;
        document.getElementById('successModal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('successModal').classList.add('hidden');
    }

    clearAll() {
        this.currentImage = null;
        this.currentRotation = 0;
        this.originalFileName = '';

        document.getElementById('imageInfo').classList.add('hidden');
        document.getElementById('rotationControls').classList.add('hidden');
        document.getElementById('outputControls').classList.add('hidden');
        document.getElementById('actionButtons').classList.add('hidden');

        const container = document.getElementById('previewContainer');
        container.innerHTML = `
            <div class="preview-empty-state">
                <div class="preview-icon">🖼️</div>
                <p>上传图片后将显示预览</p>
                <p class="hint">支持旋转调整预览效果</p>
            </div>
        `;

        document.getElementById('previewDimensions').textContent = '-';
        document.getElementById('rotationValue').textContent = '0°';
        document.getElementById('outputFilename').value = 'converted';
    }

    showLoading(text = '处理中...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Initialize new instance
window.imageConverter = new ImageToPDFConverter();
