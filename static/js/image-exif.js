var imageExifComponent = `
<div class="image-exif-container">
    <div class="exif-header">
        <h2>📝 图片Exif信息查看工具</h2>
        <div class="exif-actions">
            <button class="btn btn-secondary" onclick="resetExif()">清空</button>
            <button class="btn btn-primary" onclick="copyExifInfo()" id="copyBtn" disabled>复制信息</button>
        </div>
    </div>
    
    <div class="exif-main">
        <!-- 左侧上传预览 -->
        <div class="exif-preview-panel">
            <div class="panel-header">
                <span>图片预览</span>
                <span class="image-size-info" id="imageSize"></span>
            </div>
            <div class="upload-area" id="uploadArea" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" onclick="triggerFileInput()">
                <input type="file" id="exifFileInput" accept="image/*" onchange="loadImageForExif(event)" style="display: none;">
                <div class="upload-placeholder" id="uploadPlaceholder">
                    <div class="upload-icon">🖼️</div>
                    <p>点击或拖拽图片到此处</p>
                    <small>支持JPG/JPEG/PNG格式</small>
                </div>
                <img id="previewImage" style="display: none; max-width: 100%; max-height: 100%;">
            </div>
        </div>
        
        <!-- 右侧信息展示 -->
        <div class="exif-info-panel">
            <div class="panel-header">
                <span>Exif信息</span>
            </div>
            <div class="info-container" id="infoContainer">
                <div class="empty-info" id="emptyInfo">
                    <div style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;">ℹ️</div>
                    <p>上传图片后将显示Exif信息</p>
                </div>
                <div id="exifContent" style="display: none;"></div>
            </div>
        </div>
    </div>
</div>
`;

var currentExifData = null;

// 拖拽相关
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.add('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('uploadArea').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const fileInput = document.getElementById('exifFileInput');
        fileInput.files = files;
        loadImageForExif({ target: { files } });
    }
}

function triggerFileInput() {
    document.getElementById('exifFileInput').click();
}

// 加载图片
function loadImageForExif(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 显示文件大小
    const sizeInKB = Math.round(file.size / 1024);
    const sizeText = sizeInKB > 1024 ? `${(sizeInKB / 1024).toFixed(2)} MB` : `${sizeInKB} KB`;
    document.getElementById('imageSize').textContent = `${file.name} - ${sizeText}`;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        // 显示预览
        const img = document.getElementById('previewImage');
        img.src = event.target.result;
        img.style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
        
        // 读取Exif（EXIF 库按需加载，第一次查看信息时才下载）
        ITLibs.load('exif').then(function () {
            EXIF.getData(file, function() {
                currentExifData = EXIF.getAllTags(this);
                renderExifInfo(currentExifData);
                document.getElementById('copyBtn').disabled = false;
            });
        }).catch(function (error) {
            console.error('EXIF 库加载失败:', error);
        });
    };
    reader.readAsDataURL(file);
}

// 渲染Exif信息
function renderExifInfo(exif) {
    const container = document.getElementById('exifContent');
    const emptyInfo = document.getElementById('emptyInfo');
    
    if (Object.keys(exif).length === 0) {
        container.innerHTML = `
        <div class="exif-card">
            <h3>⚠️ 未检测到Exif信息</h3>
            <p>该图片可能没有保存Exif元数据，或者是经过压缩/编辑后信息被清除了。</p>
        </div>`;
    } else {
        let html = '';
        
        // 基础信息
        html += `
        <div class="exif-card">
            <h3>📱 设备信息</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">品牌</span>
                    <span class="info-value">${exif.Make || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">型号</span>
                    <span class="info-value">${exif.Model || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">拍摄时间</span>
                    <span class="info-value">${exif.DateTimeOriginal || exif.DateTime || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">修改时间</span>
                    <span class="info-value">${exif.DateTime || '-'}</span>
                </div>
            </div>
        </div>`;
        
        // 拍摄参数
        html += `
        <div class="exif-card">
            <h3>📷 拍摄参数</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">光圈</span>
                    <span class="info-value">${exif.FNumber ? `f/${exif.FNumber}` : '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">快门速度</span>
                    <span class="info-value">${exif.ExposureTime ? `${exif.ExposureTime}s` : '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">ISO感光度</span>
                    <span class="info-value">${exif.ISOSpeedRatings || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">焦距</span>
                    <span class="info-value">${exif.FocalLength ? `${exif.FocalLength}mm` : '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">曝光补偿</span>
                    <span class="info-value">${exif.ExposureBiasValue ? `${exif.ExposureBiasValue} EV` : '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">测光模式</span>
                    <span class="info-value">${getMeteringModeText(exif.MeteringMode)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">闪光灯</span>
                    <span class="info-value">${getFlashText(exif.Flash)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">白平衡</span>
                    <span class="info-value">${getWhiteBalanceText(exif.WhiteBalance)}</span>
                </div>
            </div>
        </div>`;
        
        // GPS信息
        if (exif.GPSLatitude && exif.GPSLongitude) {
            const lat = exif.GPSLatitude;
            const lng = exif.GPSLongitude;
            const latDecimal = parseGPSCoord(lat, exif.GPSLatitudeRef);
            const lngDecimal = parseGPSCoord(lng, exif.GPSLongitudeRef);
            const mapUrl = `https://maps.google.com/?q=${latDecimal},${lngDecimal}&ll=${latDecimal},${lngDecimal}&z=15`;
            
            html += `
            <div class="exif-card">
                <h3>📍 GPS位置信息</h3>
                <div class="info-grid">
                    <div class="info-item info-item-full">
                        <span class="info-label">纬度</span>
                        <span class="info-value">${formatGPS(lat)} ${exif.GPSLatitudeRef || ''} (${latDecimal.toFixed(6)})</span>
                    </div>
                    <div class="info-item info-item-full">
                        <span class="info-label">经度</span>
                        <span class="info-value">${formatGPS(lng)} ${exif.GPSLongitudeRef || ''} (${lngDecimal.toFixed(6)})</span>
                    </div>
                    ${exif.GPSAltitude ? `
                    <div class="info-item info-item-full">
                        <span class="info-label">海拔</span>
                        <span class="info-value">${exif.GPSAltitude} 米</span>
                    </div>
                    ` : ''}
                </div>
                <a href="${mapUrl}" target="_blank" class="map-link">
                    🗺️ 在地图中查看位置
                </a>
            </div>`;
        }
        
        // 图片信息
        html += `
        <div class="exif-card">
            <h3>🖼️ 图片信息</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">宽度</span>
                    <span class="info-value">${exif.PixelXDimension || exif.ImageWidth || '-'} px</span>
                </div>
                <div class="info-item">
                    <span class="info-label">高度</span>
                    <span class="info-value">${exif.PixelYDimension || exif.ImageLength || '-'} px</span>
                </div>
                <div class="info-item">
                    <span class="info-label">色彩空间</span>
                    <span class="info-value">${exif.ColorSpace == 1 ? 'sRGB' : exif.ColorSpace || '-'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">分辨率</span>
                    <span class="info-value">
                        ${exif.XResolution ? `${exif.XResolution}x${exif.YResolution}` : '-'} 
                        ${exif.ResolutionUnit == 2 ? 'DPI' : ''}
                    </span>
                </div>
            </div>
        </div>`;
        
        container.innerHTML = html;
    }
    
    emptyInfo.style.display = 'none';
    container.style.display = 'block';
}

// GPS相关工具函数
function parseGPSCoord(coords, ref) {
    if (!coords || coords.length < 3) return 0;
    
    const degrees = coords[0];
    const minutes = coords[1] || 0;
    const seconds = coords[2] || 0;
    
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    if (ref === 'S' || ref === 'W') decimal = -decimal;
    
    return decimal;
}

function formatGPS(coords) {
    if (!coords || coords.length < 3) return '-';
    return `${coords[0]}° ${coords[1]}' ${coords[2].toFixed(2)}"`;
}

// 枚举文本转换
function getMeteringModeText(mode) {
    switch(mode) {
        case 0: return '未知';
        case 1: return '平均测光';
        case 2: return '中央重点平均测光';
        case 3: return '点测光';
        case 4: return '多点测光';
        case 5: return '评估测光';
        case 6: return '局部测光';
        default: return mode || '-';
    }
}

function getFlashText(flash) {
    if (flash === undefined) return '-';
    return (flash & 1) === 1 ? '开启' : '关闭';
}

function getWhiteBalanceText(mode) {
    if (mode === undefined) return '-';
    return mode === 0 ? '自动' : mode === 1 ? '手动' : mode;
}

// 复制信息
function copyExifInfo() {
    if (!currentExifData) return;
    
    let text = '📝 图片Exif信息\r\n';
    text += '========================\r\n';
    text += '📱 设备信息：\r\n';
    text += `品牌：${currentExifData.Make || '-'}\r\n`;
    text += `型号：${currentExifData.Model || '-'}\r\n`;
    text += `拍摄时间：${currentExifData.DateTimeOriginal || currentExifData.DateTime || '-'}\r\n\r\n`;
    
    text += '📷 拍摄参数：\r\n';
    text += `光圈：${currentExifData.FNumber ? `f/${currentExifData.FNumber}` : '-'}\r\n`;
    text += `快门速度：${currentExifData.ExposureTime ? `${currentExifData.ExposureTime}s` : '-'}\r\n`;
    text += `ISO：${currentExifData.ISOSpeedRatings || '-'}\r\n`;
    text += `焦距：${currentExifData.FocalLength ? `${currentExifData.FocalLength}mm` : '-'}\r\n\r\n`;
    
    if (currentExifData.GPSLatitude && currentExifData.GPSLongitude) {
        const lat = parseGPSCoord(currentExifData.GPSLatitude, currentExifData.GPSLatitudeRef);
        const lng = parseGPSCoord(currentExifData.GPSLongitude, currentExifData.GPSLongitudeRef);
        text += '📍 GPS信息：\r\n';
        text += `纬度：${lat.toFixed(6)}\r\n`;
        text += `经度：${lng.toFixed(6)}\r\n`;
        if (currentExifData.GPSAltitude) {
            text += `海拔：${currentExifData.GPSAltitude}米\r\n`;
        }
        text += `地图链接：https://maps.google.com/?q=${lat},${lng}\r\n\r\n`;
    }
    
    text += '🖼️ 图片信息：\r\n';
    text += `尺寸：${currentExifData.PixelXDimension || currentExifData.ImageWidth || '-'} x ${currentExifData.PixelYDimension || currentExifData.ImageLength || '-'} px\r\n`;
    text += `色彩空间：${currentExifData.ColorSpace == 1 ? 'sRGB' : currentExifData.ColorSpace || '-'}\r\n`;
    
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Exif信息已复制到剪贴板');
    }).catch(() => {
        alert('❌ 复制失败，请手动复制');
    });
}

// 重置
function resetExif() {
    document.getElementById('previewImage').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('exifContent').style.display = 'none';
    document.getElementById('emptyInfo').style.display = 'block';
    document.getElementById('imageSize').textContent = '';
    document.getElementById('copyBtn').disabled = true;
    document.getElementById('exifFileInput').value = '';
    currentExifData = null;
}
