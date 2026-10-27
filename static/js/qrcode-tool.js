// 这两个页面（生成/解析）共用本脚本，路由切换时会被重新注入，
// 因此顶层状态必须用 var 声明：const/let 重复声明会直接抛 SyntaxError 让整页失效。
var currentQRImage = null;
var qrGenerateHistory = [];

function switchQrTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'generate') {
        document.getElementById('generatePanel').style.display = 'block';
        document.getElementById('parsePanel').style.display = 'none';
    } else {
        document.getElementById('generatePanel').style.display = 'none';
        document.getElementById('parsePanel').style.display = 'block';
    }
}

async function generateQRCode() {
    const content = document.getElementById('qrContentInput').value.trim();
    if (!content) {
        alert('请输入内容');
        return;
    }

    // qrcode 库按需加载：只有真正生成二维码时才下载
    await ITLibs.load('qrcode');

    const size = parseInt(document.getElementById('qrSizeSelect').value);
    const errorLevel = document.getElementById('qrErrorLevel').value;

    const previewArea = document.getElementById('qrPreviewArea');
    previewArea.innerHTML = '';

    const qrDiv = document.createElement('div');
    qrDiv.id = 'qrcode';
    qrDiv.style.display = 'inline-block';
    previewArea.appendChild(qrDiv);

    new QRCode(qrDiv, {
        text: content,
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel[errorLevel]
    });

    document.getElementById('downloadActions').style.display = 'flex';

    addToHistory(content);
}

function addToHistory(content) {
    if (qrGenerateHistory.length >= 10) {
        qrGenerateHistory.pop();
    }
    qrGenerateHistory.unshift(content);

    const historyDiv = document.getElementById('generateHistory');
    const historyList = document.getElementById('historyList');

    historyDiv.style.display = 'block';
    historyList.innerHTML = qrGenerateHistory.map((item, index) => `
        <div class="history-item" onclick="useHistoryItem('${item.replace(/'/g, "\\'")}')">
            <span class="history-content">${item.substring(0, 30)}${item.length > 30 ? '...' : ''}</span>
            <button class="history-delete" onclick="deleteHistoryItem(event, ${index})">×</button>
        </div>
    `).join('');
}

function useHistoryItem(content) {
    document.getElementById('qrContentInput').value = content;
    generateQRCode();
}

function deleteHistoryItem(event, index) {
    event.stopPropagation();
    qrGenerateHistory.splice(index, 1);
    if (qrGenerateHistory.length === 0) {
        document.getElementById('generateHistory').style.display = 'none';
    } else {
        document.getElementById('historyList').innerHTML = qrGenerateHistory.map((item, i) => `
            <div class="history-item" onclick="useHistoryItem('${item.replace(/'/g, "\\'")}')">
                <span class="history-content">${item.substring(0, 30)}${item.length > 30 ? '...' : ''}</span>
                <button class="history-delete" onclick="deleteHistoryItem(event, ${i})">×</button>
            </div>
        `).join('');
    }
}

function downloadQRCode(format) {
    const qrCanvas = document.querySelector('#qrcode canvas');
    if (!qrCanvas) {
        const qrImg = document.querySelector('#qrcode img');
        if (qrImg && qrImg.src) {
            const link = document.createElement('a');
            link.download = 'qrcode.' + format;
            link.href = qrImg.src;
            link.click();
        }
        return;
    }

    let downloadData;
    let mimeType;

    if (format === 'png') {
        downloadData = qrCanvas.toDataURL('image/png');
        mimeType = 'image/png';
    } else if (format === 'jpg') {
        downloadData = qrCanvas.toDataURL('image/jpeg', 0.9);
        mimeType = 'image/jpeg';
    } else if (format === 'svg') {
        const size = qrCanvas.width;
        const ctx = qrCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, size, size);
        const svg = generateSVGFromCanvas(imgData, size);
        downloadData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        mimeType = 'image/svg+xml';
    }

    const link = document.createElement('a');
    link.download = 'qrcode.' + format;
    link.href = downloadData;
    link.click();
}

function generateSVGFromCanvas(imgData, size) {
    const svgStart = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`;
    const svgEnd = '</svg>';

    let rects = '';
    const pixelSize = 1;

    for (let y = 0; y < size; y += pixelSize) {
        for (let x = 0; x < size; x += pixelSize) {
            const i = (y * size + x) * 4;
            const r = imgData.data[i];
            const g = imgData.data[i + 1];
            const b = imgData.data[i + 2];
            const a = imgData.data[i + 3];

            if (a > 128) {
                const brightness = (r + g + b) / 3;
                if (brightness < 128) {
                    rects += `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="#000000"/>`;
                }
            }
        }
    }

    return svgStart + rects + svgEnd;
}

function clearGenerate() {
    document.getElementById('qrContentInput').value = '';
    document.getElementById('qrPreviewArea').innerHTML = `
        <div class="qr-placeholder">
            <div style="font-size: 4rem;">⬜</div>
            <p>生成的二维码将显示在这里</p>
        </div>
    `;
    document.getElementById('downloadActions').style.display = 'none';
}

function handleQrDragOver(e) {
    e.preventDefault();
    document.getElementById('qrUploadArea').classList.add('drag-over');
}

function handleQrDrop(e) {
    e.preventDefault();
    document.getElementById('qrUploadArea').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const fileInput = document.getElementById('qrFileInput');
        fileInput.files = files;
        loadQrImage({ target: { files } });
    }
}

function triggerQrFileInput() {
    document.getElementById('qrFileInput').click();
}

function loadQrImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const previewImg = document.getElementById('qrUploadPreview');
        previewImg.src = event.target.result;
        previewImg.style.display = 'block';
        document.getElementById('qrUploadPlaceholder').style.display = 'none';

        const parsePreview = document.getElementById('parsePreviewArea');
        parsePreview.innerHTML = '';
        const imgCopy = document.createElement('img');
        imgCopy.src = event.target.result;
        imgCopy.style.maxWidth = '100%';
        imgCopy.style.maxHeight = '400px';
        parsePreview.appendChild(imgCopy);

        currentQRImage = new Image();
        currentQRImage.onload = function() {
            parseQRCode(currentQRImage);
        };
        currentQRImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

async function parseQRCode(img) {
    // jsQR 按需加载：只有解析二维码图片时才下载
    await ITLibs.load('jsqr');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    const resultDiv = document.getElementById('parseResult');
    const resultText = document.getElementById('qrResultText');
    const resultType = document.getElementById('resultType');
    const openLinkBtn = document.getElementById('openLinkBtn');

    if (code) {
        resultText.textContent = code.data;
        resultType.textContent = getQrTypeLabel(code.data);

        const isUrl = /^https?:\/\//i.test(code.data);
        openLinkBtn.style.display = isUrl ? 'inline-block' : 'none';

        resultDiv.style.display = 'block';
    } else {
        resultText.textContent = '未能在图片中识别到有效的二维码';
        resultType.textContent = '⚠️ 无法识别';
        openLinkBtn.style.display = 'none';
        resultDiv.style.display = 'block';
    }
}

function getQrTypeLabel(data) {
    if (/^https?:\/\//i.test(data)) return '🌐 URL链接';
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data)) return '📧 电子邮件';
    if (/^tel:/i.test(data)) return '📞 电话号码';
    if (/^smsto:/i.test(data)) return '💬 短信';
    if (/^geo:/i.test(data)) return '📍 地理位置';
    if (/^WIFI:/i.test(data)) return '📶 WiFi信息';
    if (/^\d{6,}$/.test(data)) return '📱 数字';
    return '📝 文本';
}

function copyQrResult() {
    const text = document.getElementById('qrResultText').textContent;
    if (text && !text.includes('未能')) {
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ 已复制到剪贴板');
        }).catch(() => {
            alert('❌ 复制失败');
        });
    }
}

function openQrLink() {
    const text = document.getElementById('qrResultText').textContent;
    if (/^https?:\/\//i.test(text)) {
        window.open(text, '_blank');
    }
}

function clearParse() {
    document.getElementById('qrUploadPreview').style.display = 'none';
    document.getElementById('qrUploadPreview').src = '';
    document.getElementById('qrUploadPlaceholder').style.display = 'block';
    document.getElementById('qrFileInput').value = '';
    document.getElementById('parsePreviewArea').innerHTML = `
        <div class="qr-placeholder">
            <div style="font-size: 4rem;">🔍</div>
            <p>上传的二维码图片将显示在这里</p>
        </div>
    `;
    document.getElementById('parseResult').style.display = 'none';
    currentQRImage = null;
}