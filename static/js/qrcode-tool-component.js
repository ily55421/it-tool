const qrcodeToolComponent = `
<div class="qrcode-tool-container">
    <div class="qrcode-header">
        <h2>📱 二维码工具</h2>
        <div class="qrcode-tabs">
            <button class="tab-btn active" onclick="switchQrTab('generate')">生成二维码</button>
            <button class="tab-btn" onclick="switchQrTab('parse')">解析二维码</button>
        </div>
    </div>

    <div id="generatePanel" class="qrcode-panel">
        <div class="qrcode-main">
            <div class="qrcode-input-section">
                <div class="input-card">
                    <h3>📝 输入内容</h3>
                    <textarea id="qrContentInput" placeholder="输入网址、文字或数字..." rows="4"></textarea>
                    <div class="input-options">
                        <div class="option-row">
                            <label>二维码尺寸:</label>
                            <select id="qrSizeSelect">
                                <option value="150">小 (150x150)</option>
                                <option value="200" selected>中 (200x200)</option>
                                <option value="300">大 (300x300)</option>
                                <option value="400">特大 (400x400)</option>
                            </select>
                        </div>
                        <div class="option-row">
                            <label>容错级别:</label>
                            <select id="qrErrorLevel">
                                <option value="L">低 (7%)</option>
                                <option value="M" selected>中 (15%)</option>
                                <option value="Q">高 (25%)</option>
                                <option value="H">最高 (30%)</option>
                            </select>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn btn-primary" onclick="generateQRCode()">生成二维码</button>
                        <button class="btn btn-secondary" onclick="clearGenerate()">清空</button>
                    </div>
                </div>

                <div id="generateHistory" class="history-card" style="display: none;">
                    <h3>📋 生成历史</h3>
                    <div id="historyList" class="history-list"></div>
                </div>
            </div>

            <div class="qrcode-preview-section">
                <div class="preview-card">
                    <h3>👁️ 预览</h3>
                    <div id="qrPreviewArea" class="qr-preview-area">
                        <div class="qr-placeholder">
                            <div style="font-size: 4rem;">⬜</div>
                            <p>生成的二维码将显示在这里</p>
                        </div>
                    </div>
                    <div id="downloadActions" class="download-actions" style="display: none;">
                        <button class="btn btn-success" onclick="downloadQRCode('png')">📥 下载 PNG</button>
                        <button class="btn btn-success" onclick="downloadQRCode('jpg')">📥 下载 JPG</button>
                        <button class="btn btn-success" onclick="downloadQRCode('svg')">📥 下载 SVG</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="parsePanel" class="qrcode-panel" style="display: none;">
        <div class="qrcode-main">
            <div class="qrcode-input-section">
                <div class="input-card">
                    <h3>📤 上传二维码图片</h3>
                    <div class="upload-area" id="qrUploadArea" ondrop="handleQrDrop(event)" ondragover="handleQrDragOver(event)" onclick="triggerQrFileInput()">
                        <input type="file" id="qrFileInput" accept="image/*" onchange="loadQrImage(event)" style="display: none;">
                        <div class="upload-placeholder" id="qrUploadPlaceholder">
                            <div class="upload-icon">🔍</div>
                            <p>点击或拖拽二维码图片到此处</p>
                            <small>支持 JPG/PNG/GIF/BMP 格式</small>
                        </div>
                        <img id="qrUploadPreview" style="display: none; max-width: 100%; max-height: 300px;">
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="clearParse()">清空</button>
                    </div>
                </div>

                <div id="parseResult" class="result-card" style="display: none;">
                    <h3>📄 解析结果</h3>
                    <div class="result-content">
                        <div class="result-label">内容:</div>
                        <div id="qrResultText" class="result-value"></div>
                    </div>
                    <div class="result-type" id="resultType"></div>
                    <div class="actions">
                        <button class="btn btn-primary" onclick="copyQrResult()">📋 复制结果</button>
                        <button class="btn btn-secondary" onclick="openQrLink()" id="openLinkBtn" style="display: none;">🔗 打开链接</button>
                    </div>
                </div>
            </div>

            <div class="qrcode-preview-section">
                <div class="preview-card">
                    <h3>👁️ 图片预览</h3>
                    <div id="parsePreviewArea" class="qr-preview-area">
                        <div class="qr-placeholder">
                            <div style="font-size: 4rem;">🔍</div>
                            <p>上传的二维码图片将显示在这里</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="qrLoading" class="overlay hidden">
        <div class="spinner"></div>
        <p>处理中...</p>
    </div>
</div>
`;