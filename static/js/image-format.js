// 页面结构在 image-format-component.js（base.html 静态引入）里，这里只放交互逻辑。
// 路由切换会重新注入本脚本，顶层状态必须用 var：const/let 重复声明会让整页脚本直接失效。
var currentFormatImage = null;
var currentFormatFile = null;
var selectedTargetFormat = 'jpeg';
var convertedBlob = null;

function handleFormatDragOver(e) {
    e.preventDefault();
    document.getElementById('formatUploadArea').classList.add('drag-over');
}

function handleFormatDrop(e) {
    e.preventDefault();
    document.getElementById('formatUploadArea').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const fileInput = document.getElementById('formatFileInput');
        fileInput.files = files;
        loadFormatImage({ target: { files } });
    }
}

function triggerFormatFileInput() {
    document.getElementById('formatFileInput').click();
}

function loadFormatImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    currentFormatFile = file;

    const reader = new FileReader();
    reader.onload = function(event) {
        const previewImg = document.getElementById('formatUploadPreview');
        previewImg.src = event.target.result;
        previewImg.style.display = 'block';
        document.getElementById('formatUploadPlaceholder').style.display = 'none';

        const img = new Image();
        img.onload = function() {
            const originalFormat = file.type.split('/')[1] || 'unknown';
            const sizeInKB = Math.round(file.size / 1024);
            const sizeText = sizeInKB > 1024 ? `${(sizeInKB / 1024).toFixed(2)} MB` : `${sizeInKB} KB`;

            document.getElementById('formatFileName').textContent = file.name;
            document.getElementById('formatOriginalType').textContent = originalFormat.toUpperCase();
            document.getElementById('formatDimensions').textContent = `${img.width} × ${img.height} px`;
            document.getElementById('formatFileSize').textContent = sizeText;

            const baseName = file.name.replace(/\.[^/.]+$/, '');
            document.getElementById('outputName').value = baseName + '_converted';

            currentFormatImage = img;
            document.getElementById('formatImageInfo').style.display = 'block';
            document.getElementById('convertBtn').disabled = false;

            updateFormatPreview(event.target.result, originalFormat);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function selectFormat(format) {
    selectedTargetFormat = format;

    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.format === format) {
            btn.classList.add('active');
        }
    });

    const qualityOption = document.getElementById('qualityOption');
    if (format === 'jpeg' || format === 'webp') {
        qualityOption.style.display = 'block';
    } else {
        qualityOption.style.display = 'none';
    }

    if (currentFormatImage) {
        const previewSrc = document.getElementById('formatUploadPreview').src;
        const originalFormat = currentFormatFile.type.split('/')[1] || 'unknown';
        updateFormatPreview(previewSrc, originalFormat);
    }
}

function updateQualityDisplay() {
    const quality = document.getElementById('formatQuality').value;
    document.getElementById('qualityValue').textContent = quality;
}

function updateFormatPreview(src, originalFormat) {
    const previewArea = document.getElementById('formatPreviewArea');

    if (selectedTargetFormat === originalFormat) {
        previewArea.innerHTML = `
            <div class="preview-placeholder">
                <div style="font-size: 4rem;">ℹ️</div>
                <p>目标格式与原图相同</p>
                <p class="hint">请选择不同的输出格式</p>
            </div>
        `;
        return;
    }

    previewArea.innerHTML = `<img src="${src}" class="preview-image" alt="预览">`;
}

async function convertImageFormat() {
    if (!currentFormatImage || !currentFormatFile) {
        alert('请先上传图片');
        return;
    }

    const outputName = document.getElementById('outputName').value.trim();
    if (!outputName) {
        alert('请输入输出文件名');
        return;
    }

    showFormatLoading('正在转换格式...');

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = currentFormatImage.width;
        canvas.height = currentFormatImage.height;
        ctx.drawImage(currentFormatImage, 0, 0);

        let mimeType;
        let quality = 0.9;

        switch (selectedTargetFormat) {
            case 'jpeg':
                mimeType = 'image/jpeg';
                quality = parseInt(document.getElementById('formatQuality').value) / 100;
                break;
            case 'png':
                mimeType = 'image/png';
                break;
            case 'webp':
                mimeType = 'image/webp';
                quality = parseInt(document.getElementById('formatQuality').value) / 100;
                break;
            case 'gif':
                mimeType = 'image/gif';
                break;
            case 'bmp':
                mimeType = 'image/bmp';
                break;
        }

        const dataUrl = await new Promise(resolve => {
            canvas.toDataURL(mimeType, quality);
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(blob);
            }, mimeType, quality);
        });

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, mimeType, quality);
        });

        convertedBlob = blob;

        const sizeInKB = Math.round(blob.size / 1024);
        const sizeText = sizeInKB > 1024 ? `${(sizeInKB / 1024).toFixed(2)} MB` : `${sizeInKB} KB`;

        document.getElementById('resultFormat').textContent = selectedTargetFormat.toUpperCase();
        document.getElementById('resultSize').textContent = sizeText;
        document.getElementById('formatResultInfo').style.display = 'block';
        document.getElementById('formatDownloadArea').style.display = 'block';

        const previewArea = document.getElementById('formatPreviewArea');
        previewArea.innerHTML = `<img src="${dataUrl}" class="preview-image" alt="预览结果">`;

    } catch (error) {
        console.error('Convert error:', error);
        alert('转换失败，请重试');
    } finally {
        hideFormatLoading();
    }
}

function downloadConvertedImage() {
    if (!convertedBlob) {
        alert('请先转换图片');
        return;
    }

    const outputName = document.getElementById('outputName').value.trim() || 'converted';
    const extension = selectedTargetFormat === 'jpeg' ? 'jpg' : selectedTargetFormat;
    const filename = `${outputName}.${extension}`;

    const url = URL.createObjectURL(convertedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function clearFormat() {
    currentFormatImage = null;
    currentFormatFile = null;
    convertedBlob = null;
    selectedTargetFormat = 'jpeg';

    document.getElementById('formatUploadPreview').style.display = 'none';
    document.getElementById('formatUploadPreview').src = '';
    document.getElementById('formatUploadPlaceholder').style.display = 'block';
    document.getElementById('formatFileInput').value = '';
    document.getElementById('formatImageInfo').style.display = 'none';
    document.getElementById('formatPreviewArea').innerHTML = `
        <div class="preview-placeholder">
            <div style="font-size: 4rem;">🔄</div>
            <p>上传图片后将显示预览</p>
        </div>
    `;
    document.getElementById('formatResultInfo').style.display = 'none';
    document.getElementById('formatDownloadArea').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    document.getElementById('outputName').value = '';
    document.getElementById('formatQuality').value = 90;
    document.getElementById('qualityValue').textContent = '90';

    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.format === 'jpeg') {
            btn.classList.add('active');
        }
    });

    document.getElementById('qualityOption').style.display = 'block';
}

function showFormatLoading(text = '处理中...') {
    document.getElementById('formatLoadingText').textContent = text;
    document.getElementById('formatLoading').classList.remove('hidden');
}

function hideFormatLoading() {
    document.getElementById('formatLoading').classList.add('hidden');
}