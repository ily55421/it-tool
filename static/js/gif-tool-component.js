const gifToolComponent = `
<div class="gif-tool-container">
    <div class="gif-header">
        <h2>🎬 GIF工具箱</h2>
        <p>GIF动画创建和处理，所有功能均在本地完成</p>
    </div>

    <div class="gif-main">
        <div class="gif-tabs">
            <button class="gif-tab-btn active" onclick="switchGifTab('create')">✨ 创建GIF</button>
            <button class="gif-tab-btn" onclick="switchGifTab('edit')">✂️ 编辑GIF</button>
            <button class="gif-tab-btn" onclick="switchGifTab('extract')">🖼️ 提取帧</button>
        </div>

        <!-- 创建GIF -->
        <div id="gifCreatePanel" class="gif-panel">
            <div class="gif-content">
                <div class="gif-left-panel">
                    <div class="upload-card">
                        <h3>📤 上传图片序列</h3>
                        <p class="upload-hint">选择多张图片按顺序创建GIF动画</p>
                        <div class="upload-area" id="gifUploadArea" ondrop="handleGifDrop(event)" ondragover="handleGifDragOver(event)" onclick="triggerGifFileInput()">
                            <input type="file" id="gifFileInput" accept="image/*" multiple onchange="loadGifImages(event)" style="display: none;">
                            <div class="upload-placeholder">
                                <div class="upload-icon">🎬</div>
                                <p>点击或拖拽图片到此处</p>
                                <small>支持 JPG/PNG/GIF 格式</small>
                            </div>
                        </div>
                        <div id="gifImageList" class="image-list" style="display: none;"></div>
                    </div>

                    <div class="settings-card" id="gifSettings" style="display: none;">
                        <h3>⚙️ GIF设置</h3>
                        
                        <div class="setting-group">
                            <label>动画尺寸:</label>
                            <div class="size-inputs">
                                <input type="number" id="gifWidth" value="320" min="50" max="800">
                                <span>×</span>
                                <input type="number" id="gifHeight" value="240" min="50" max="600">
                            </div>
                            <label class="checkbox-label">
                                <input type="checkbox" id="gifKeepRatio" checked onchange="updateGifPreview()">
                                保持宽高比例
                            </label>
                        </div>

                        <div class="setting-group">
                            <label>播放速度:</label>
                            <div class="speed-control">
                                <input type="range" id="gifSpeed" min="10" max="200" value="100" oninput="updateSpeedDisplay()">
                                <span id="speedValue">100%</span>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label>循环播放:</label>
                            <select id="gifLoop">
                                <option value="0">无限循环</option>
                                <option value="1">循环1次</option>
                                <option value="2">循环2次</option>
                                <option value="3">循环3次</option>
                                <option value="5">循环5次</option>
                            </select>
                        </div>

                        <div class="actions">
                            <button class="btn btn-primary" onclick="createGif()" id="createGifBtn">🎬 创建GIF</button>
                            <button class="btn btn-secondary" onclick="clearGifImages()">🗑️ 清空</button>
                        </div>
                    </div>
                </div>

                <div class="gif-right-panel">
                    <div class="preview-card">
                        <h3>👁️ 预览</h3>
                        <div id="gifPreviewArea" class="preview-area">
                            <div class="preview-placeholder">
                                <div style="font-size: 4rem;">🎬</div>
                                <p>上传图片后将显示GIF预览</p>
                            </div>
                        </div>
                        <div id="gifResultInfo" class="result-info" style="display: none;">
                            <div class="info-row">
                                <span>帧数:</span>
                                <span id="gifFrameCount">-</span>
                            </div>
                            <div class="info-row">
                                <span>尺寸:</span>
                                <span id="gifOutputSize">-</span>
                            </div>
                            <div class="info-row">
                                <span>大小:</span>
                                <span id="gifFileSize">-</span>
                            </div>
                        </div>
                        <div id="gifDownloadArea" class="download-area" style="display: none;">
                            <button class="btn btn-success btn-large" onclick="downloadGif()">📥 下载GIF</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 编辑GIF -->
        <div id="gifEditPanel" class="gif-panel" style="display: none;">
            <div class="gif-content">
                <div class="gif-left-panel">
                    <div class="upload-card">
                        <h3>📤 上传GIF文件</h3>
                        <div class="upload-area" id="editGifUploadArea" ondrop="handleEditGifDrop(event)" ondragover="handleEditGifDragOver(event)" onclick="triggerEditGifFileInput()">
                            <input type="file" id="editGifFileInput" accept="image/gif" onchange="loadEditGif(event)" style="display: none;">
                            <div class="upload-placeholder">
                                <div class="upload-icon">🎞️</div>
                                <p>点击或拖拽GIF文件到此处</p>
                            </div>
                        </div>
                    </div>

                    <div class="settings-card" id="editGifSettings" style="display: none;">
                        <h3>⚙️ 编辑选项</h3>
                        
                        <div class="setting-group">
                            <label>调整播放速度:</label>
                            <div class="speed-control">
                                <input type="range" id="editGifSpeed" min="10" max="200" value="100" oninput="updateEditSpeedDisplay()">
                                <span id="editSpeedValue">100%</span>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label>裁剪GIF:</label>
                            <div class="crop-inputs">
                                <div>
                                    <label>X:</label>
                                    <input type="number" id="editCropX" value="0" min="0">
                                </div>
                                <div>
                                    <label>Y:</label>
                                    <input type="number" id="editCropY" value="0" min="0">
                                </div>
                                <div>
                                    <label>宽度:</label>
                                    <input type="number" id="editCropW" value="100" min="10">
                                </div>
                                <div>
                                    <label>高度:</label>
                                    <input type="number" id="editCropH" value="100" min="10">
                                </div>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label>缩放:</label>
                            <select id="editGifScale">
                                <option value="0.5">50%</option>
                                <option value="0.75">75%</option>
                                <option value="1" selected>100%</option>
                                <option value="1.5">150%</option>
                                <option value="2">200%</option>
                            </select>
                        </div>

                        <div class="actions">
                            <button class="btn btn-primary" onclick="processEditGif()" id="processEditBtn">✨ 应用更改</button>
                        </div>
                    </div>
                </div>

                <div class="gif-right-panel">
                    <div class="preview-card">
                        <h3>👁️ 预览</h3>
                        <div id="editGifPreviewArea" class="preview-area">
                            <div class="preview-placeholder">
                                <div style="font-size: 4rem;">🎞️</div>
                                <p>上传GIF后将显示预览</p>
                            </div>
                        </div>
                        <div id="editGifDownloadArea" class="download-area" style="display: none;">
                            <button class="btn btn-success btn-large" onclick="downloadEditedGif()">📥 下载编辑后的GIF</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 提取GIF帧 -->
        <div id="gifExtractPanel" class="gif-panel" style="display: none;">
            <div class="gif-content">
                <div class="gif-left-panel">
                    <div class="upload-card">
                        <h3>📤 上传GIF文件</h3>
                        <div class="upload-area" id="extractGifUploadArea" ondrop="handleExtractGifDrop(event)" ondragover="handleExtractGifDragOver(event)" onclick="triggerExtractGifFileInput()">
                            <input type="file" id="extractGifFileInput" accept="image/gif" onchange="loadExtractGif(event)" style="display: none;">
                            <div class="upload-placeholder">
                                <div class="upload-icon">🖼️</div>
                                <p>点击或拖拽GIF文件到此处</p>
                                <small>将提取GIF的每一帧</small>
                            </div>
                        </div>
                    </div>

                    <div id="extractSettings" class="settings-card" style="display: none;">
                        <h3>⚙️ 提取设置</h3>
                        <div class="setting-group">
                            <label>帧范围:</label>
                            <div class="page-range">
                                <input type="number" id="extractFrom" value="1" min="1" placeholder="起始帧">
                                <span>至</span>
                                <input type="number" id="extractTo" value="1" min="1" placeholder="结束帧">
                            </div>
                        </div>
                        <div class="actions">
                            <button class="btn btn-primary" onclick="extractGifFrames()" id="extractBtn">🖼️ 提取全部帧</button>
                        </div>
                    </div>
                </div>

                <div class="gif-right-panel">
                    <div class="preview-card">
                        <h3>👁️ 预览</h3>
                        <div id="extractGifPreviewArea" class="preview-area">
                            <div class="preview-placeholder">
                                <div style="font-size: 4rem;">🖼️</div>
                                <p>上传GIF后将显示预览</p>
                            </div>
                        </div>
                    </div>
                    <div id="framesCard" class="pages-card" style="display: none;">
                        <h3>📑 提取的帧</h3>
                        <div id="framesList" class="pages-list"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="gifLoading" class="overlay hidden">
        <div class="spinner"></div>
        <p id="gifLoadingText">处理中...</p>
    </div>
</div>
`;

let gifImages = [];
let speedValue = 100;

function switchGifTab(tab) {
    document.querySelectorAll('.gif-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.gif-panel').forEach(panel => panel.style.display = 'none');

    event.target.classList.add('active');
    document.getElementById('gif' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Panel').style.display = 'block';
}

function handleGifDragOver(e) {
    e.preventDefault();
    document.getElementById('gifUploadArea').classList.add('drag-over');
}

function handleGifDrop(e) {
    e.preventDefault();
    document.getElementById('gifUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            loadGifImages({ target: { files: imageFiles } });
        }
    }
}

function triggerGifFileInput() {
    document.getElementById('gifFileInput').click();
}

function loadGifImages(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    gifImages = [];
    let loadedCount = 0;

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                gifImages.push({ file, image: img, dataUrl: event.target.result });
                loadedCount++;
                if (loadedCount === files.length) {
                    showGifImageList();
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function showGifImageList() {
    const list = document.getElementById('gifImageList');
    const settings = document.getElementById('gifSettings');

    if (gifImages.length === 0) {
        list.style.display = 'none';
        settings.style.display = 'none';
        return;
    }

    list.style.display = 'block';
    settings.style.display = 'block';

    list.innerHTML = gifImages.map((item, index) => `
        <div class="image-item">
            <span class="image-index">${index + 1}</span>
            <img src="${item.dataUrl}" alt="Frame ${index + 1}">
            <button class="remove-btn" onclick="removeGifImage(${index})">×</button>
        </div>
    `).join('');

    document.getElementById('gifFrameCount').textContent = gifImages.length + ' 帧';
}

function removeGifImage(index) {
    gifImages.splice(index, 1);
    showGifImageList();
}

function clearGifImages() {
    gifImages = [];
    document.getElementById('gifFileInput').value = '';
    showGifImageList();
    document.getElementById('gifPreviewArea').innerHTML = `
        <div class="preview-placeholder">
            <div style="font-size: 4rem;">🎬</div>
            <p>上传图片后将显示GIF预览</p>
        </div>
    `;
    document.getElementById('gifResultInfo').style.display = 'none';
    document.getElementById('gifDownloadArea').style.display = 'none';
}

function updateSpeedDisplay() {
    speedValue = document.getElementById('gifSpeed').value;
    document.getElementById('speedValue').textContent = speedValue + '%';
}

function updateEditSpeedDisplay() {
    const value = document.getElementById('editGifSpeed').value;
    document.getElementById('editSpeedValue').textContent = value + '%';
}

function updateGifPreview() {
    const keepRatio = document.getElementById('gifKeepRatio').checked;
    if (keepRatio && gifImages.length > 0) {
        const firstImg = gifImages[0].image;
        const ratio = firstImg.width / firstImg.height;
        const width = parseInt(document.getElementById('gifWidth').value) || 320;
        document.getElementById('gifHeight').value = Math.round(width / ratio);
    }
}

async function createGif() {
    if (gifImages.length < 2) {
        alert('请至少上传2张图片来创建GIF');
        return;
    }

    showGifLoading('正在创建GIF...');

    try {
        // gif.js 只在真正创建时才下载（约 30 KB + worker），见 lib-loader.js
        await ITLibs.load('gif');

        const width = parseInt(document.getElementById('gifWidth').value) || 320;
        const height = parseInt(document.getElementById('gifHeight').value) || 240;
        const delay = Math.round(100 / speedValue * 50);
        const loop = parseInt(document.getElementById('gifLoop').value);

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: width,
            height: height,
            workerScript: '/static/lib/gif.worker.js'
        });

        gifImages.forEach(item => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(item.image, 0, 0, width, height);
            gif.addFrame(canvas, { delay: delay });
        });

        gif.on('finished', function(blob) {
            const url = URL.createObjectURL(blob);
            const previewArea = document.getElementById('gifPreviewArea');
            previewArea.innerHTML = `<img src="${url}" alt="GIF Preview">`;

            document.getElementById('gifOutputSize').textContent = `${width}×${height}`;
            document.getElementById('gifFileSize').textContent = formatSize(blob.size);
            document.getElementById('gifResultInfo').style.display = 'block';
            document.getElementById('gifDownloadArea').style.display = 'block';

            window.createdGifBlob = blob;
            hideGifLoading();
        });

        gif.render();

    } catch (error) {
        console.error('Create GIF error:', error);
        alert('创建GIF失败，请重试');
        hideGifLoading();
    }
}

function downloadGif() {
    if (!window.createdGifBlob) return;

    const url = URL.createObjectURL(window.createdGifBlob);
    const link = document.createElement('a');
    link.download = 'animation.gif';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function showGifLoading(text = '处理中...') {
    document.getElementById('gifLoadingText').textContent = text;
    document.getElementById('gifLoading').classList.remove('hidden');
}

function hideGifLoading() {
    document.getElementById('gifLoading').classList.add('hidden');
}

// Edit GIF functions
function handleEditGifDragOver(e) {
    e.preventDefault();
    document.getElementById('editGifUploadArea').classList.add('drag-over');
}

function handleEditGifDrop(e) {
    e.preventDefault();
    document.getElementById('editGifUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'image/gif') {
        const fileInput = document.getElementById('editGifFileInput');
        fileInput.files = files;
        loadEditGif({ target: { files } });
    }
}

function triggerEditGifFileInput() {
    document.getElementById('editGifFileInput').click();
}

async function loadEditGif(e) {
    const file = e.target.files[0];
    if (!file) return;

    showGifLoading('正在读取GIF...');

    try {
        const url = URL.createObjectURL(file);
        const previewArea = document.getElementById('editGifPreviewArea');
        previewArea.innerHTML = `<img src="${url}" alt="GIF Preview">`;

        document.getElementById('editGifSettings').style.display = 'block';
        document.getElementById('editGifDownloadArea').style.display = 'block';
        document.getElementById('editGifFileInput').value = '';

        window.editGifFile = file;
        hideGifLoading();
    } catch (error) {
        console.error('Load GIF error:', error);
        alert('读取GIF失败');
        hideGifLoading();
    }
}

async function processEditGif() {
    if (!window.editGifFile) return;
    alert('编辑GIF功能正在开发中...');
}

// Extract GIF frames functions
function handleExtractGifDragOver(e) {
    e.preventDefault();
    document.getElementById('extractGifUploadArea').classList.add('drag-over');
}

function handleExtractGifDrop(e) {
    e.preventDefault();
    document.getElementById('extractGifUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'image/gif') {
        const fileInput = document.getElementById('extractGifFileInput');
        fileInput.files = files;
        loadExtractGif({ target: { files } });
    }
}

function triggerExtractGifFileInput() {
    document.getElementById('extractGifFileInput').click();
}

async function loadExtractGif(e) {
    const file = e.target.files[0];
    if (!file) return;

    showGifLoading('正在分析GIF...');

    try {
        const url = URL.createObjectURL(file);
        const previewArea = document.getElementById('extractGifPreviewArea');
        previewArea.innerHTML = `<img src="${url}" alt="GIF Preview">`;

        document.getElementById('extractSettings').style.display = 'block';
        document.getElementById('framesCard').style.display = 'block';

        document.getElementById('extractTo').value = 10;

        window.extractGifFile = file;
        hideGifLoading();
    } catch (error) {
        console.error('Load GIF error:', error);
        alert('读取GIF失败');
        hideGifLoading();
    }
}

function extractGifFrames() {
    if (!window.extractGifFile) return;
    alert('提取帧功能正在开发中，可以使用播放按钮查看每帧');
}