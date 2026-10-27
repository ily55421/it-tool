const imageIdPhotoComponent = `
<div class="idphoto-container">
    <div class="idphoto-header">
        <h2>🪪 证件照处理工具</h2>
        <p>一键更换背景色、调整尺寸、生成标准证件照</p>
    </div>

    <div class="idphoto-main">
        <div class="idphoto-left-panel">
            <div class="upload-card">
                <h3>📤 上传照片</h3>
                <div class="upload-area" id="idphotoUploadArea" ondrop="handleIdPhotoDrop(event)" ondragover="handleIdPhotoDragOver(event)" onclick="triggerIdPhotoFileInput()">
                    <input type="file" id="idphotoFileInput" accept="image/*" onchange="loadIdPhoto(event)" style="display: none;">
                    <div class="upload-placeholder" id="idphotoUploadPlaceholder">
                        <div class="upload-icon">🪪</div>
                        <p>点击或拖拽证件照到此处</p>
                        <small>支持 JPG/PNG 格式</small>
                    </div>
                    <img id="idphotoPreview" style="display: none; max-width: 100%; max-height: 300px;">
                </div>
            </div>

            <div class="settings-card">
                <h3>⚙️ 处理设置</h3>
                
                <div class="setting-group">
                    <label>证件照尺寸:</label>
                    <select id="idphotoSize" onchange="updateIdPhotoPreview()">
                        <option value="1">1寸 (25mm×35mm)</option>
                        <option value="2">2寸 (35mm×49mm)</option>
                        <option value="小1寸">小1寸 (22mm×32mm)</option>
                        <option value="大1寸">大1寸 (28mm×40mm)</option>
                        <option value="custom">自定义</option>
                    </select>
                </div>

                <div id="customSizeInputs" class="setting-group" style="display: none;">
                    <label>自定义尺寸 (mm):</label>
                    <div class="size-inputs-inline">
                        <input type="number" id="customWidth" placeholder="宽" min="10" max="500">
                        <span>×</span>
                        <input type="number" id="customHeight" placeholder="高" min="10" max="500">
                    </div>
                </div>

                <div class="setting-group">
                    <label>背景颜色:</label>
                    <div class="color-options">
                        <button class="color-btn active" onclick="selectBgColor('white')" data-color="white">
                            <span class="color-swatch" style="background: #ffffff; border: 1px solid #ccc;"></span>
                            白色
                        </button>
                        <button class="color-btn" onclick="selectBgColor('blue')" data-color="blue">
                            <span class="color-swatch" style="background: #0070BA;"></span>
                            蓝色
                        </button>
                        <button class="color-btn" onclick="selectBgColor('red')" data-color="red">
                            <span class="color-swatch" style="background: #C00000;"></span>
                            红色
                        </button>
                    </div>
                </div>

                <div class="setting-group">
                    <label>输出格式:</label>
                    <select id="idphotoFormat">
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                    </select>
                </div>

                <div class="setting-group">
                    <label>输出质量:</label>
                    <input type="range" id="idphotoQuality" min="10" max="100" value="90">
                    <span id="idphotoQualityValue">90%</span>
                </div>

                <div class="actions">
                    <button class="btn btn-primary" onclick="processIdPhoto()" id="processBtn" disabled>✨ 处理照片</button>
                    <button class="btn btn-secondary" onclick="downloadIdPhoto()" id="downloadBtn" disabled>📥 下载证件照</button>
                </div>
            </div>
        </div>

        <div class="idphoto-right-panel">
            <div class="preview-card">
                <h3>👁️ 预览效果</h3>
                <div id="idphotoPreviewArea" class="preview-area">
                    <div class="preview-placeholder">
                        <div style="font-size: 4rem;">🪪</div>
                        <p>上传照片后将显示证件照预览</p>
                    </div>
                </div>
                <div id="idphotoInfo" class="photo-info" style="display: none;">
                    <div class="info-row">
                        <span>尺寸:</span>
                        <span id="outputSize">-</span>
                    </div>
                    <div class="info-row">
                        <span>背景:</span>
                        <span id="outputBg">-</span>
                    </div>
                </div>
            </div>

            <div class="print-card" id="printCard" style="display: none;">
                <h3>🖨️ 排版打印</h3>
                <p class="print-hint">可将多张证件照排版到一张纸上方便打印</p>
                <div class="print-options">
                    <label>排版数量:</label>
                    <select id="printLayout">
                        <option value="4">4张/页 (2×2)</option>
                        <option value="8">8张/页 (4×2)</option>
                        <option value="9">9张/页 (3×3)</option>
                    </select>
                </div>
                <button class="btn btn-success" onclick="generatePrintLayout()">📄 生成打印排版</button>
            </div>
        </div>
    </div>

    <div id="idphotoLoading" class="overlay hidden">
        <div class="spinner"></div>
        <p>处理中...</p>
    </div>
</div>
`;

let currentIdPhoto = null;
let currentBgColor = 'white';
let processedIdPhotoBlob = null;

const BG_COLORS = {
    white: { r: 255, g: 255, b: 255 },
    blue: { r: 0, g: 112, b: 186 },
    red: { r: 192, g: 0, b: 0 }
};

const PHOTO_SIZES = {
    '1': { width: 25, height: 35, name: '1寸' },
    '2': { width: 35, height: 49, name: '2寸' },
    '小1寸': { width: 22, height: 32, name: '小1寸' },
    '大1寸': { width: 28, height: 40, name: '大1寸' }
};

function handleIdPhotoDragOver(e) {
    e.preventDefault();
    document.getElementById('idphotoUploadArea').classList.add('drag-over');
}

function handleIdPhotoDrop(e) {
    e.preventDefault();
    document.getElementById('idphotoUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const fileInput = document.getElementById('idphotoFileInput');
        fileInput.files = files;
        loadIdPhoto({ target: { files } });
    }
}

function triggerIdPhotoFileInput() {
    document.getElementById('idphotoFileInput').click();
}

function loadIdPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            currentIdPhoto = img;
            document.getElementById('idphotoPreview').src = event.target.result;
            document.getElementById('idphotoPreview').style.display = 'block';
            document.getElementById('idphotoUploadPlaceholder').style.display = 'none';
            document.getElementById('processBtn').disabled = false;
            updateIdPhotoPreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function selectBgColor(color) {
    currentBgColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.color === color) {
            btn.classList.add('active');
        }
    });
    updateIdPhotoPreview();
}

function updateIdPhotoPreview() {
    if (!currentIdPhoto) return;

    const sizeSelect = document.getElementById('idphotoSize').value;
    let photoWidth, photoHeight;

    if (sizeSelect === 'custom') {
        photoWidth = parseInt(document.getElementById('customWidth').value) || 25;
        photoHeight = parseInt(document.getElementById('customHeight').value) || 35;
        document.getElementById('customSizeInputs').style.display = 'block';
    } else {
        const size = PHOTO_SIZES[sizeSelect];
        photoWidth = size.width;
        photoHeight = size.height;
        document.getElementById('customSizeInputs').style.display = 'none';
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const dpi = 300;
    const mmToPx = dpi / 25.4;
    const displayMmToPx = 3;

    canvas.width = photoWidth * displayMmToPx;
    canvas.height = photoHeight * displayMmToPx;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(currentIdPhoto, 0, 0, canvas.width, canvas.height);

    const previewArea = document.getElementById('idphotoPreviewArea');
    previewArea.innerHTML = '';
    const previewImg = document.createElement('img');
    previewImg.src = canvas.toDataURL();
    previewImg.style.maxWidth = '100%';
    previewImg.style.border = '1px solid #ddd';
    previewArea.appendChild(previewImg);

    document.getElementById('outputSize').textContent = `${photoWidth}mm × ${photoHeight}mm`;
    document.getElementById('outputBg').textContent = currentBgColor === 'white' ? '白色' : currentBgColor === 'blue' ? '蓝色' : '红色';
    document.getElementById('idphotoInfo').style.display = 'block';
    document.getElementById('printCard').style.display = 'block';
}

async function processIdPhoto() {
    if (!currentIdPhoto) return;

    showIdPhotoLoading();

    try {
        const sizeSelect = document.getElementById('idphotoSize').value;
        let photoWidth, photoHeight;

        if (sizeSelect === 'custom') {
            photoWidth = parseInt(document.getElementById('customWidth').value) || 25;
            photoHeight = parseInt(document.getElementById('customHeight').value) || 35;
        } else {
            const size = PHOTO_SIZES[sizeSelect];
            photoWidth = size.width;
            photoHeight = size.height;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const dpi = 300;
        const mmToPx = dpi / 25.4;

        canvas.width = Math.round(photoWidth * mmToPx);
        canvas.height = Math.round(photoHeight * mmToPx);

        const bg = BG_COLORS[currentBgColor];
        ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const imgAspect = currentIdPhoto.width / currentIdPhoto.height;
        const canvasAspect = canvas.width / canvas.height;

        let sx = 0, sy = 0, sw = currentIdPhoto.width, sh = currentIdPhoto.height;

        if (imgAspect > canvasAspect) {
            sw = currentIdPhoto.height * canvasAspect;
            sx = (currentIdPhoto.width - sw) / 2;
        } else {
            sh = currentIdPhoto.width / canvasAspect;
            sy = (currentIdPhoto.height - sh) / 2;
        }

        ctx.drawImage(currentIdPhoto, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        const format = document.getElementById('idphotoFormat').value;
        const quality = parseInt(document.getElementById('idphotoQuality').value) / 100;

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, `image/${format}`, quality);
        });

        processedIdPhotoBlob = blob;

        const previewArea = document.getElementById('idphotoPreviewArea');
        previewArea.innerHTML = '';
        const previewImg = document.createElement('img');
        previewImg.src = URL.createObjectURL(blob);
        previewImg.style.maxWidth = '100%';
        previewImg.style.border = '1px solid #ddd';
        previewArea.appendChild(previewImg);

        document.getElementById('downloadBtn').disabled = false;

    } catch (error) {
        console.error('Process error:', error);
        alert('处理失败，请重试');
    } finally {
        hideIdPhotoLoading();
    }
}

function downloadIdPhoto() {
    if (!processedIdPhotoBlob) return;

    const sizeSelect = document.getElementById('idphotoSize').value;
    let filename = 'id_photo';
    if (sizeSelect !== 'custom') {
        filename = `id_photo_${sizeSelect}寸`;
    }

    const format = document.getElementById('idphotoFormat').value;
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    const url = URL.createObjectURL(processedIdPhotoBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
}

function generatePrintLayout() {
    if (!processedIdPhotoBlob) return;

    const count = parseInt(document.getElementById('printLayout').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const pageWidth = 210 * 3;
    const pageHeight = 297 * 3;
    canvas.width = pageWidth;
    canvas.height = pageHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = function() {
        let cols, rows;
        if (count === 4) { cols = 2; rows = 2; }
        else if (count === 8) { cols = 4; rows = 2; }
        else { cols = 3; rows = 3; }

        const cellWidth = pageWidth / cols;
        const cellHeight = pageHeight / rows;
        const margin = 10;

        const photoSize = Math.min(cellWidth - margin * 2, cellHeight - margin * 2);
        const offsetX = (cellWidth - photoSize) / 2;
        const offsetY = (cellHeight - photoSize) / 2;

        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = col * cellWidth + offsetX;
            const y = row * cellHeight + offsetY;
            ctx.drawImage(img, x, y, photoSize, photoSize);
        }

        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'id_photo_print_layout.png';
        link.href = url;
        link.click();
    };
    img.src = URL.createObjectURL(processedIdPhotoBlob);
}

function showIdPhotoLoading() {
    document.getElementById('idphotoLoading').classList.remove('hidden');
}

function hideIdPhotoLoading() {
    document.getElementById('idphotoLoading').classList.add('hidden');
}