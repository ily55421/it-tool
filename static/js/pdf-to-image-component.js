const pdfToImageComponent = `
<div class="pdf-to-image-container">
    <div class="pdf-header">
        <h2>📄 PDF转图片工具</h2>
        <p>将PDF文档的每一页转换为图片，支持多种输出格式</p>
    </div>

    <div class="pdf-main">
        <div class="pdf-left-panel">
            <div class="upload-card">
                <h3>📤 上传PDF文件</h3>
                <div class="upload-area" id="pdfUploadArea" ondrop="handlePdfDrop(event)" ondragover="handlePdfDragOver(event)" onclick="triggerPdfFileInput()">
                    <input type="file" id="pdfFileInput" accept=".pdf" onchange="loadPdfFile(event)" style="display: none;">
                    <div class="upload-placeholder" id="pdfUploadPlaceholder">
                        <div class="upload-icon">📄</div>
                        <p>点击或拖拽PDF文件到此处</p>
                        <small>支持 PDF 格式文件</small>
                    </div>
                    <div id="pdfFileInfo" class="file-info" style="display: none;">
                        <div class="file-name" id="pdfFileName">-</div>
                        <div class="file-size" id="pdfFileSize">-</div>
                    </div>
                </div>
            </div>

            <div class="settings-card" id="pdfSettings" style="display: none;">
                <h3>⚙️ 输出设置</h3>
                
                <div class="setting-group">
                    <label>输出格式:</label>
                    <select id="pdfOutputFormat">
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                    </select>
                </div>

                <div id="jpegQualityGroup" class="setting-group">
                    <label>图片质量: <span id="pdfQualityValue">90</span>%</label>
                    <input type="range" id="pdfQuality" min="10" max="100" value="90">
                </div>

                <div class="setting-group">
                    <label>图片尺寸:</label>
                    <select id="pdfScale">
                        <option value="1">原始尺寸 (72 DPI)</option>
                        <option value="2">2倍 (144 DPI)</option>
                        <option value="3" selected>3倍 (216 DPI)</option>
                        <option value="4">4倍 (288 DPI)</option>
                    </select>
                </div>

                <div class="setting-group">
                    <label>页面范围:</label>
                    <div class="page-range">
                        <input type="number" id="pageFrom" value="1" min="1" placeholder="起始页">
                        <span>至</span>
                        <input type="number" id="pageTo" value="1" min="1" placeholder="结束页">
                    </div>
                    <small id="pageRangeHint">PDF共有 <span id="totalPages">0</span> 页</small>
                </div>

                <div class="actions">
                    <button class="btn btn-primary" onclick="convertPdfToImages()" id="convertBtn">🔄 开始转换</button>
                    <button class="btn btn-secondary" onclick="downloadAllImages()" id="downloadAllBtn" disabled>📥 下载全部</button>
                </div>
            </div>
        </div>

        <div class="pdf-right-panel">
            <div class="preview-card">
                <h3>👁️ 预览</h3>
                <div class="page-nav" id="pageNav" style="display: none;">
                    <button class="btn btn-sm" onclick="prevPage()">◀ 上一页</button>
                    <span id="currentPageInfo">第 1 / 1 页</span>
                    <button class="btn btn-sm" onclick="nextPage()">下一页 ▶</button>
                </div>
                <div id="pdfPreviewArea" class="preview-area">
                    <div class="preview-placeholder">
                        <div style="font-size: 4rem;">📄</div>
                        <p>上传PDF后将显示页面预览</p>
                    </div>
                </div>
            </div>

            <div class="pages-card" id="pagesCard" style="display: none;">
                <h3>📑 页面列表</h3>
                <div id="pagesList" class="pages-list"></div>
            </div>
        </div>
    </div>

    <div id="pdfLoading" class="overlay hidden">
        <div class="spinner"></div>
        <p id="pdfLoadingText">正在转换...</p>
    </div>
</div>
`;

let currentPdfFile = null;
let currentPdfPages = [];
let currentPreviewPage = 1;

function handlePdfDragOver(e) {
    e.preventDefault();
    document.getElementById('pdfUploadArea').classList.add('drag-over');
}

function handlePdfDrop(e) {
    e.preventDefault();
    document.getElementById('pdfUploadArea').classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        const fileInput = document.getElementById('pdfFileInput');
        fileInput.files = files;
        loadPdfFile({ target: { files } });
    }
}

function triggerPdfFileInput() {
    document.getElementById('pdfFileInput').click();
}

async function loadPdfFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    currentPdfFile = file;

    document.getElementById('pdfFileName').textContent = file.name;
    document.getElementById('pdfFileSize').textContent = formatFileSize(file.size);
    document.getElementById('pdfUploadPlaceholder').style.display = 'none';
    document.getElementById('pdfFileInfo').style.display = 'block';
    document.getElementById('pdfSettings').style.display = 'block';

    showPdfLoading('正在读取PDF...');

    try {
        await ITLibs.load('pdfjs');   // pdf.js 按需加载，首次打开 PDF 时才下载
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        document.getElementById('totalPages').textContent = numPages;
        document.getElementById('pageFrom').max = numPages;
        document.getElementById('pageTo').max = numPages;
        document.getElementById('pageTo').value = numPages;

        currentPdfPages = [];
        for (let i = 1; i <= numPages; i++) {
            currentPdfPages.push({ pageNum: i, imageData: null });
        }

        await renderPage(1);

        document.getElementById('pageNav').style.display = 'flex';
        document.getElementById('pagesCard').style.display = 'block';
        renderPagesList();

    } catch (error) {
        console.error('PDF load error:', error);
        alert('读取PDF失败，请确保文件是有效的PDF文档');
    } finally {
        hidePdfLoading();
    }
}

async function renderPage(pageNum) {
    if (!currentPdfFile) return;

    await ITLibs.load('pdfjs');
    const arrayBuffer = await currentPdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageNum);

    const scale = parseInt(document.getElementById('pdfScale').value);
    const viewport = page.getViewport({ scale: scale * 72 / 96 });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
        canvasContext: ctx,
        viewport: viewport
    }).promise;

    currentPdfPages[pageNum - 1].imageData = canvas.toDataURL('image/png');
    currentPreviewPage = pageNum;

    displayPagePreview(currentPdfPages[pageNum - 1].imageData);
    updatePageNav();
}

function displayPagePreview(imageData) {
    const previewArea = document.getElementById('pdfPreviewArea');
    previewArea.innerHTML = '';
    const img = document.createElement('img');
    img.src = imageData;
    img.style.maxWidth = '100%';
    img.style.border = '1px solid #ddd';
    previewArea.appendChild(img);
}

function updatePageNav() {
    const total = currentPdfPages.length;
    document.getElementById('currentPageInfo').textContent = `第 ${currentPreviewPage} / ${total} 页`;
}

function prevPage() {
    if (currentPreviewPage > 1) {
        renderPage(currentPreviewPage - 1);
    }
}

function nextPage() {
    if (currentPreviewPage < currentPdfPages.length) {
        renderPage(currentPreviewPage + 1);
    }
}

function renderPagesList() {
    const list = document.getElementById('pagesList');
    list.innerHTML = currentPdfPages.map((page, index) => `
        <div class="page-item ${page.pageNum === currentPreviewPage ? 'active' : ''}" onclick="goToPage(${page.pageNum})">
            <span class="page-thumb">
                ${page.imageData ? `<img src="${page.imageData}" alt="Page ${page.pageNum}">` : '📄'}
            </span>
            <span class="page-num">第${page.pageNum}页</span>
            ${page.imageData ? '<span class="page-ready">✓</span>' : ''}
        </div>
    `).join('');
}

function goToPage(pageNum) {
    renderPage(pageNum);
    renderPagesList();
}

async function convertPdfToImages() {
    if (!currentPdfFile) return;

    const fromPage = parseInt(document.getElementById('pageFrom').value);
    const toPage = parseInt(document.getElementById('pageTo').value);

    if (fromPage > toPage) {
        alert('起始页不能大于结束页');
        return;
    }

    showPdfLoading(`正在转换第 ${fromPage} - ${toPage} 页...`);

    try {
        for (let i = fromPage; i <= toPage; i++) {
            await renderPage(i);
            document.getElementById('pdfLoadingText').textContent = `已转换 ${i - fromPage + 1} / ${toPage - fromPage + 1} 页`;
        }

        document.getElementById('downloadAllBtn').disabled = false;
        renderPagesList();

        alert('✅ 转换完成！可以下载了。');
    } catch (error) {
        console.error('Convert error:', error);
        alert('转换失败，请重试');
    } finally {
        hidePdfLoading();
    }
}

function downloadAllImages() {
    if (!currentPdfFile) return;

    const fromPage = parseInt(document.getElementById('pageFrom').value);
    const toPage = parseInt(document.getElementById('pageTo').value);
    const format = document.getElementById('pdfOutputFormat').value;

    for (let i = fromPage; i <= toPage; i++) {
        const page = currentPdfPages[i - 1];
        if (page.imageData) {
            setTimeout(() => {
                const link = document.createElement('a');
                link.download = `page_${i}.${format === 'jpeg' ? 'jpg' : format}`;
                link.href = page.imageData;
                link.click();
            }, (i - fromPage) * 300);
        }
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showPdfLoading(text = '处理中...') {
    document.getElementById('pdfLoadingText').textContent = text;
    document.getElementById('pdfLoading').classList.remove('hidden');
}

function hidePdfLoading() {
    document.getElementById('pdfLoading').classList.add('hidden');
}