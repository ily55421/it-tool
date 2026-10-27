var imageProcessorComponent = `
<div class="image-processor-container">
    <div class="image-processor-header">
        <h2>🖼️ 图片处理工具</h2>
        <div class="image-actions">
            <button class="btn btn-primary" onclick="downloadImage()">下载图片</button>
            <button class="btn btn-secondary" onclick="resetImage()">重置</button>
        </div>
    </div>
    
    <div class="image-main">
        <!-- 左侧上传和预览区 -->
        <div class="image-panel">
            <div class="panel-header">
                <span>原图片</span>
                <span class="image-info" id="originalInfo"></span>
            </div>
            <div class="image-upload-area" id="uploadArea" ondrop="handleDrop(event)" ondragover="handleDragOver(event)">
                <input type="file" id="imageInput" accept="image/*" onchange="loadImage(event)" style="display: none;">
                <div class="upload-placeholder" id="uploadPlaceholder">
                    <div class="upload-icon">📁</div>
                    <p>点击或拖拽图片到此处上传</p>
                    <small>支持 JPG/PNG/GIF/WebP 等格式</small>
                </div>
                <img id="originalImage" style="display: none; max-width: 100%; max-height: 100%;">
            </div>
        </div>
        
        <!-- 右侧处理后预览区 -->
        <div class="image-panel">
            <div class="panel-header">
                <span>处理后</span>
                <span class="image-info" id="processedInfo"></span>
            </div>
            <div class="image-preview-area">
                <canvas id="processedCanvas" style="display: none; max-width: 100%; max-height: 100%;"></canvas>
                <div class="preview-placeholder" id="previewPlaceholder">
                    <p>上传图片后处理效果将显示在这里</p>
                </div>
            </div>
        </div>
        
        <!-- 中间控制面板 -->
        <div class="control-panel">
            <div class="control-group">
                <h3>✨ 处理模式</h3>
                <div class="mode-buttons">
                    <button class="mode-btn active" onclick="setMode('basic')">基础处理</button>
                    <button class="mode-btn" onclick="setMode('crop')">图片裁剪</button>
                    <button class="mode-btn" onclick="setMode('grid')">九宫格切图</button>
                    <button class="mode-btn" onclick="setMode('watermark')">加水印</button>
                    <button class="mode-btn" onclick="setMode('text')">文字生成</button>
                </div>
            </div>
            
            <!-- 基础处理 -->
            <div id="basicPanel" class="mode-panel">
                <div class="control-group">
                    <h3>格式转换</h3>
                    <select id="formatSelect" onchange="processImage()">
                        <option value="png">PNG</option>
                        <option value="jpeg">JPG</option>
                        <option value="webp">WebP</option>
                        <option value="gif">GIF</option>
                    </select>
                </div>
                
                <div class="control-group">
                    <h3>质量压缩</h3>
                    <div class="slider-control">
                        <input type="range" id="qualitySlider" min="10" max="100" value="80" oninput="updateQualityValue()">
                        <span id="qualityValue">80%</span>
                    </div>
                </div>
                
                <div class="control-group">
                    <h3>尺寸调整</h3>
                    <div class="size-inputs">
                        <div>
                            <label>宽度:</label>
                            <input type="number" id="widthInput" placeholder="自动" min="1" onchange="processImage()">
                        </div>
                        <div>
                            <label>高度:</label>
                            <input type="number" id="heightInput" placeholder="自动" min="1" onchange="processImage()">
                        </div>
                    </div>
                    <label class="checkbox-label">
                        <input type="checkbox" id="keepRatio" checked onchange="processImage()">
                        保持宽高比例
                    </label>
                </div>
                
                <div class="control-group">
                    <h3>旋转翻转</h3>
                    <div class="rotate-buttons">
                        <button class="btn btn-sm" onclick="rotateImage(-90)">↺ 左旋90°</button>
                        <button class="btn btn-sm" onclick="rotateImage(90)">↻ 右旋90°</button>
                        <button class="btn btn-sm" onclick="flipImage('horizontal')">⇋ 水平翻转</button>
                        <button class="btn btn-sm" onclick="flipImage('vertical')">⇅ 垂直翻转</button>
                    </div>
                </div>
            </div>
            
            <!-- 图片裁剪 -->
            <div id="cropPanel" class="mode-panel" style="display: none;">
                <div class="control-group">
                    <h3>裁剪区域</h3>
                    <div class="crop-inputs">
                        <div>
                            <label>X:</label>
                            <input type="number" id="cropX" value="0" min="0" onchange="updateCropPreview()">
                        </div>
                        <div>
                            <label>Y:</label>
                            <input type="number" id="cropY" value="0" min="0" onchange="updateCropPreview()">
                        </div>
                        <div>
                            <label>宽度:</label>
                            <input type="number" id="cropWidth" value="200" min="1" onchange="updateCropPreview()">
                        </div>
                        <div>
                            <label>高度:</label>
                            <input type="number" id="cropHeight" value="200" min="1" onchange="updateCropPreview()">
                        </div>
                    </div>
                    <div class="preset-ratios">
                        <button class="btn btn-sm" onclick="setCropRatio('1:1')">1:1</button>
                        <button class="btn btn-sm" onclick="setCropRatio('4:3')">4:3</button>
                        <button class="btn btn-sm" onclick="setCropRatio('16:9')">16:9</button>
                        <button class="btn btn-sm" onclick="setCropRatio('9:16')">9:16</button>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" onclick="applyCrop()">✂️ 应用裁剪</button>
            </div>
            
            <!-- 九宫格切图 -->
            <div id="gridPanel" class="mode-panel" style="display: none;">
                <div class="control-group">
                    <h3>切图设置</h3>
                    <div class="grid-options">
                        <label>网格大小:</label>
                        <select id="gridSize" onchange="updateGridPreview()">
                            <option value="3x3" selected>3×3 (九宫格)</option>
                            <option value="2x2">2×2</option>
                            <option value="2x3">2×3</option>
                            <option value="3x2">3×2</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" onclick="splitGrid()">🔲 切图并下载全部</button>
            </div>
            
            <!-- 加水印 -->
            <div id="watermarkPanel" class="mode-panel" style="display: none;">
                <div class="control-group">
                    <h3>文字水印</h3>
                    <input type="text" id="watermarkText" placeholder="输入水印文字" oninput="updateWatermarkPreview()">
                    <div class="watermark-options">
                        <div>
                            <label>字体大小:</label>
                            <input type="number" id="watermarkSize" value="24" min="12" max="72" onchange="updateWatermarkPreview()">
                        </div>
                        <div>
                            <label>透明度:</label>
                            <input type="range" id="watermarkOpacity" min="10" max="100" value="50" oninput="updateWatermarkOpacity()">
                            <span id="watermarkOpacityValue">50%</span>
                        </div>
                        <div>
                            <label>颜色:</label>
                            <input type="color" id="watermarkColor" value="#ffffff" onchange="updateWatermarkPreview()">
                        </div>
                    </div>
                    <label class="checkbox-label">
                        <input type="checkbox" id="watermarkRepeat" onchange="updateWatermarkPreview()">
                        重复水印
                    </label>
                </div>
                <button class="btn btn-primary btn-block" onclick="applyWatermark()">🏷️ 应用水印</button>
            </div>
            
            <!-- 文字生成图片 -->
            <div id="textPanel" class="mode-panel" style="display: none;">
                <div class="control-group">
                    <h3>文字内容</h3>
                    <textarea id="textContent" placeholder="输入要生成图片的文字..." rows="3" oninput="updateTextPreview()"></textarea>
                </div>
                <div class="control-group">
                    <h3>样式设置</h3>
                    <div class="text-options">
                        <div>
                            <label>字体大小:</label>
                            <input type="number" id="textSize" value="32" min="12" max="120" onchange="updateTextPreview()">
                        </div>
                        <div>
                            <label>文字颜色:</label>
                            <input type="color" id="textColor" value="#333333" onchange="updateTextPreview()">
                        </div>
                        <div>
                            <label>背景颜色:</label>
                            <input type="color" id="bgColor" value="#ffffff" onchange="updateTextPreview()">
                        </div>
                    </div>
                </div>
                <div class="control-group">
                    <h3>输出尺寸</h3>
                    <div class="size-inputs">
                        <div>
                            <label>宽度:</label>
                            <input type="number" id="textWidth" value="400" min="100" max="1200" onchange="updateTextPreview()">
                        </div>
                        <div>
                            <label>高度:</label>
                            <input type="number" id="textHeight" value="200" min="50" max="800" onchange="updateTextPreview()">
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" onclick="generateTextImage()">📝 生成图片</button>
            </div>
            
            <!-- Base64转换 -->
            <div class="control-group base64-group">
                <h3>🔗 Base64转换</h3>
                <button class="btn btn-sm btn-block" onclick="imageToBase64()">图片转Base64</button>
                <button class="btn btn-sm btn-block" onclick="base64ToImage()">Base64转图片</button>
                <textarea id="base64Textarea" placeholder="输入Base64或显示转换结果" rows="3"></textarea>
            </div>
        </div>
    </div>
</div>
`;

// 全局变量
var originalImage = null;
var currentCanvas = null;
var currentRotation = 0;
var flipH = false;
var flipV = false;
var originalWidth = 0;
var originalHeight = 0;
var currentMode = 'basic';

// 处理模式切换
function setMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mode-panel').forEach(panel => panel.style.display = 'none');
    
    event.target.classList.add('active');
    document.getElementById(mode + 'Panel').style.display = 'block';
    
    if (mode === 'basic' && originalImage) {
        processImage();
    }
}

// 拖拽上传
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.add('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const fileInput = document.getElementById('imageInput');
        fileInput.files = files;
        loadImage({ target: { files } });
    }
}

// 加载图片
function loadImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            originalImage = img;
            currentRotation = 0;
            flipH = false;
            flipV = false;
            originalWidth = img.width;
            originalHeight = img.height;
            
            document.getElementById('originalImage').src = event.target.result;
            document.getElementById('originalImage').style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
            
            document.getElementById('widthInput').value = originalWidth;
            document.getElementById('heightInput').value = originalHeight;
            
            document.getElementById('cropWidth').value = Math.min(200, originalWidth);
            document.getElementById('cropHeight').value = Math.min(200, originalHeight);
            
            const size = (file.size / 1024 / 1024).toFixed(2);
            document.getElementById('originalInfo').textContent = 
                `${originalWidth}×${originalHeight} | ${size}MB`;
            
            if (currentMode === 'basic') {
                processImage();
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// 更新质量显示
function updateQualityValue() {
    const value = document.getElementById('qualitySlider').value;
    document.getElementById('qualityValue').textContent = value + '%';
    processImage();
}

// 处理图片（基础模式）
function processImage() {
    if (!originalImage) return;
    
    const canvas = document.getElementById('processedCanvas');
    const ctx = canvas.getContext('2d');
    
    const width = parseInt(document.getElementById('widthInput').value) || originalWidth;
    const height = parseInt(document.getElementById('heightInput').value) || originalHeight;
    const keepRatio = document.getElementById('keepRatio').checked;
    
    let targetWidth = width;
    let targetHeight = height;
    
    if (keepRatio) {
        const ratio = originalWidth / originalHeight;
        if (width && !height) {
            targetHeight = width / ratio;
        } else if (height && !width) {
            targetWidth = height * ratio;
        } else if (width && height) {
            if (width / ratio > height) {
                targetWidth = height * ratio;
            } else {
                targetHeight = width / ratio;
            }
        }
    }
    
    let canvasWidth = targetWidth;
    let canvasHeight = targetHeight;
    if (currentRotation === 90 || currentRotation === 270) {
        [canvasWidth, canvasHeight] = [canvasHeight, canvasWidth];
    }
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((currentRotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    
    ctx.drawImage(
        originalImage,
        -targetWidth / 2,
        -targetHeight / 2,
        targetWidth,
        targetHeight
    );
    
    ctx.resetTransform();
    
    canvas.style.display = 'block';
    document.getElementById('previewPlaceholder').style.display = 'none';
    currentCanvas = canvas;
    
    updateProcessedInfo();
}

// 更新处理后信息
function updateProcessedInfo() {
    if (!currentCanvas) return;
    
    const format = document.getElementById('formatSelect').value;
    const quality = document.getElementById('qualitySlider').value / 100;
    
    const dataUrl = currentCanvas.toDataURL(`image/${format}`, quality);
    const size = Math.round((dataUrl.length * 3) / 4 / 1024);
    
    document.getElementById('processedInfo').textContent = 
        `${currentCanvas.width}×${currentCanvas.height} | ${size}KB`;
}

// 旋转图片
function rotateImage(angle) {
    currentRotation = (currentRotation + angle + 360) % 360;
    processImage();
}

// 翻转图片
function flipImage(direction) {
    if (direction === 'horizontal') {
        flipH = !flipH;
    } else {
        flipV = !flipV;
    }
    processImage();
}

// 下载图片
function downloadImage() {
    if (!currentCanvas) return;
    
    const format = document.getElementById('formatSelect').value;
    const quality = document.getElementById('qualitySlider').value / 100;
    
    const link = document.createElement('a');
    link.download = `processed_image.${format}`;
    link.href = currentCanvas.toDataURL(`image/${format}`, quality);
    link.click();
}

// 重置图片
function resetImage() {
    originalImage = null;
    currentCanvas = null;
    currentRotation = 0;
    flipH = false;
    flipV = false;
    
    document.getElementById('originalImage').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('processedCanvas').style.display = 'none';
    document.getElementById('previewPlaceholder').style.display = 'block';
    document.getElementById('originalInfo').textContent = '';
    document.getElementById('processedInfo').textContent = '';
    document.getElementById('imageInput').value = '';
    document.getElementById('base64Textarea').value = '';
    document.getElementById('widthInput').value = '';
    document.getElementById('heightInput').value = '';
    document.getElementById('qualitySlider').value = 80;
    document.getElementById('qualityValue').textContent = '80%';
}

// 图片转Base64
function imageToBase64() {
    if (!currentCanvas) return;
    
    const format = document.getElementById('formatSelect').value;
    const quality = document.getElementById('qualitySlider').value / 100;
    const base64 = currentCanvas.toDataURL(`image/${format}`, quality);
    
    document.getElementById('base64Textarea').value = base64;
}

// Base64转图片
function base64ToImage() {
    const base64 = document.getElementById('base64Textarea').value.trim();
    if (!base64 || !base64.startsWith('data:image/')) {
        alert('请输入有效的图片Base64');
        return;
    }
    
    const img = new Image();
    img.onload = function() {
        originalImage = img;
        currentRotation = 0;
        flipH = false;
        flipV = false;
        originalWidth = img.width;
        originalHeight = img.height;
        
        document.getElementById('originalImage').src = base64;
        document.getElementById('originalImage').style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
        
        document.getElementById('widthInput').value = originalWidth;
        document.getElementById('heightInput').value = originalHeight;
        
        const size = Math.round((base64.length * 3) / 4 / 1024);
        document.getElementById('originalInfo').textContent = 
            `${originalWidth}×${originalHeight} | ${size}KB`;
        
        if (currentMode === 'basic') {
            processImage();
        }
    };
    img.src = base64;
}

// 裁剪功能
function setCropRatio(ratio) {
    if (!originalImage) return;
    
    const parts = ratio.split(':');
    const wRatio = parseInt(parts[0]);
    const hRatio = parseInt(parts[1]);
    
    let cropWidth = Math.min(originalWidth, 200);
    let cropHeight = Math.round(cropWidth * hRatio / wRatio);
    
    if (cropHeight > originalHeight) {
        cropHeight = Math.min(originalHeight, 200);
        cropWidth = Math.round(cropHeight * wRatio / hRatio);
    }
    
    document.getElementById('cropWidth').value = cropWidth;
    document.getElementById('cropHeight').value = cropHeight;
    updateCropPreview();
}

function updateCropPreview() {
    if (!originalImage) return;
    
    const canvas = document.getElementById('processedCanvas');
    const ctx = canvas.getContext('2d');
    
    const x = parseInt(document.getElementById('cropX').value) || 0;
    const y = parseInt(document.getElementById('cropY').value) || 0;
    const w = parseInt(document.getElementById('cropWidth').value) || 100;
    const h = parseInt(document.getElementById('cropHeight').value) || 100;
    
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(originalImage, x, y, w, h, 0, 0, w, h);
    
    canvas.style.display = 'block';
    document.getElementById('previewPlaceholder').style.display = 'none';
    currentCanvas = canvas;
    updateProcessedInfo();
}

function applyCrop() {
    if (!currentCanvas) return;
    
    const img = new Image();
    img.onload = function() {
        originalImage = img;
        originalWidth = img.width;
        originalHeight = img.height;
        
        document.getElementById('originalImage').src = currentCanvas.toDataURL();
        document.getElementById('widthInput').value = img.width;
        document.getElementById('heightInput').value = img.height;
        
        if (currentMode === 'basic') {
            processImage();
        } else {
            updateCropPreview();
        }
    };
    img.src = currentCanvas.toDataURL();
}

// 九宫格切图
function updateGridPreview() {
    if (!originalImage) return;
    
    const gridSize = document.getElementById('gridSize').value;
    const [cols, rows] = gridSize.split('x').map(n => parseInt(n));
    
    const canvas = document.getElementById('processedCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = originalWidth;
    canvas.height = originalHeight;
    ctx.drawImage(originalImage, 0, 0);
    
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    
    const cellW = originalWidth / cols;
    const cellH = originalHeight / rows;
    
    for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, originalHeight);
        ctx.stroke();
    }
    
    for (let i = 1; i < rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(originalWidth, i * cellH);
        ctx.stroke();
    }
    
    canvas.style.display = 'block';
    document.getElementById('previewPlaceholder').style.display = 'none';
    currentCanvas = canvas;
}

function splitGrid() {
    if (!originalImage) {
        alert('请先上传图片');
        return;
    }
    
    const gridSize = document.getElementById('gridSize').value;
    const [cols, rows] = gridSize.split('x').map(n => parseInt(n));
    
    const cellW = Math.floor(originalWidth / cols);
    const cellH = Math.floor(originalHeight / rows);
    
    let downloadedCount = 0;
    const totalCount = cols * rows;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = cellW;
                canvas.height = cellH;
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    originalImage,
                    col * cellW,
                    row * cellH,
                    cellW,
                    cellH,
                    0,
                    0,
                    cellW,
                    cellH
                );
                
                const link = document.createElement('a');
                link.download = `grid_${row + 1}_${col + 1}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                downloadedCount++;
                if (downloadedCount === totalCount) {
                    alert(`✅ 已成功下载 ${totalCount} 张图片！`);
                }
            }, (row * cols + col) * 200);
        }
    }
}

// 水印功能
function updateWatermarkOpacity() {
    const value = document.getElementById('watermarkOpacity').value;
    document.getElementById('watermarkOpacityValue').textContent = value + '%';
    updateWatermarkPreview();
}

function updateWatermarkPreview() {
    if (!originalImage) return;
    
    const canvas = document.getElementById('processedCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = originalWidth;
    canvas.height = originalHeight;
    ctx.drawImage(originalImage, 0, 0);
    
    const text = document.getElementById('watermarkText').value || '水印';
    const size = parseInt(document.getElementById('watermarkSize').value) || 24;
    const opacity = parseInt(document.getElementById('watermarkOpacity').value) / 100;
    const color = document.getElementById('watermarkColor').value;
    const repeat = document.getElementById('watermarkRepeat').checked;
    
    ctx.font = `${size}px Arial`;
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (repeat) {
        const spacing = 100;
        for (let y = size; y < canvas.height; y += spacing) {
            for (let x = 0; x < canvas.width; x += spacing) {
                ctx.fillText(text, x, y);
            }
        }
    } else {
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    
    canvas.style.display = 'block';
    document.getElementById('previewPlaceholder').style.display = 'none';
    currentCanvas = canvas;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyWatermark() {
    if (!currentCanvas) return;
    
    const img = new Image();
    img.onload = function() {
        originalImage = img;
        originalWidth = img.width;
        originalHeight = img.height;
        
        document.getElementById('originalImage').src = currentCanvas.toDataURL();
        
        if (currentMode === 'basic') {
            processImage();
        }
    };
    img.src = currentCanvas.toDataURL();
}

// 文字生成图片
function updateTextPreview() {
    const canvas = document.getElementById('processedCanvas');
    const ctx = canvas.getContext('2d');
    
    const text = document.getElementById('textContent').value || '示例文字';
    const size = parseInt(document.getElementById('textSize').value) || 32;
    const textColor = document.getElementById('textColor').value;
    const bgColor = document.getElementById('bgColor').value;
    const width = parseInt(document.getElementById('textWidth').value) || 400;
    const height = parseInt(document.getElementById('textHeight').value) || 200;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = `${size}px Arial`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const lines = text.split('\n');
    const lineHeight = size + 10;
    const startY = (canvas.height - (lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });
    
    canvas.style.display = 'block';
    document.getElementById('previewPlaceholder').style.display = 'none';
    currentCanvas = canvas;
}

function generateTextImage() {
    updateTextPreview();
}