var imageFormatComponent = `
<div class="image-format-container">
    <div class="format-header">
        <h2>🔄 图片格式转换工具</h2>
        <p>支持多种图片格式之间的互相转换，所有处理均在本地完成</p>
    </div>

    <div class="format-main">
        <div class="format-left-panel">
            <div class="upload-card">
                <h3>📤 上传图片</h3>
                <div class="upload-area" id="formatUploadArea" ondrop="handleFormatDrop(event)" ondragover="handleFormatDragOver(event)" onclick="triggerFormatFileInput()">
                    <input type="file" id="formatFileInput" accept="image/*" onchange="loadFormatImage(event)" style="display: none;">
                    <div class="upload-placeholder" id="formatUploadPlaceholder">
                        <div class="upload-icon">🖼️</div>
                        <p>点击或拖拽图片到此处</p>
                        <small>支持 JPG/PNG/GIF/WebP/BMP 格式</small>
                    </div>
                    <img id="formatUploadPreview" style="display: none; max-width: 100%; max-height: 250px;">
                </div>
                <div id="formatImageInfo" class="image-info-box" style="display: none;">
                    <div class="info-row">
                        <span class="info-label">文件名:</span>
                        <span id="formatFileName" class="info-value">-</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">原始格式:</span>
                        <span id="formatOriginalType" class="info-value">-</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">尺寸:</span>
                        <span id="formatDimensions" class="info-value">-</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">大小:</span>
                        <span id="formatFileSize" class="info-value">-</span>
                    </div>
                </div>
            </div>

            <div class="output-card">
                <h3>⚙️ 输出设置</h3>
                <div class="format-options">
                    <div class="option-group">
                        <label>目标格式:</label>
                        <div class="format-buttons">
                            <button class="format-btn active" onclick="selectFormat('jpeg')" data-format="jpeg">JPEG</button>
                            <button class="format-btn" onclick="selectFormat('png')" data-format="png">PNG</button>
                            <button class="format-btn" onclick="selectFormat('webp')" data-format="webp">WebP</button>
                            <button class="format-btn" onclick="selectFormat('gif')" data-format="gif">GIF</button>
                            <button class="format-btn" onclick="selectFormat('bmp')" data-format="bmp">BMP</button>
                        </div>
                    </div>
                    <div id="qualityOption" class="option-group">
                        <label for="formatQuality">输出质量: <span id="qualityValue">90</span>%</label>
                        <input type="range" id="formatQuality" min="10" max="100" value="90" oninput="updateQualityDisplay()">
                    </div>
                    <div class="option-group">
                        <label for="outputName">输出文件名:</label>
                        <input type="text" id="outputName" placeholder="输入文件名">
                    </div>
                </div>
                <div class="actions">
                    <button class="btn btn-primary" onclick="convertImageFormat()" id="convertBtn" disabled>🔄 转换格式</button>
                    <button class="btn btn-secondary" onclick="clearFormat()">🗑️ 清空</button>
                </div>
            </div>
        </div>

        <div class="format-right-panel">
            <div class="preview-card">
                <h3>👁️ 预览</h3>
                <div id="formatPreviewArea" class="preview-area">
                    <div class="preview-placeholder">
                        <div style="font-size: 4rem;">🔄</div>
                        <p>上传图片后将显示预览</p>
                    </div>
                </div>
                <div id="formatResultInfo" class="result-info" style="display: none;">
                    <div class="result-row">
                        <span class="result-label">输出格式:</span>
                        <span id="resultFormat" class="result-value">-</span>
                    </div>
                    <div class="result-row">
                        <span class="result-label">输出大小:</span>
                        <span id="resultSize" class="result-value">-</span>
                    </div>
                </div>
                <div id="formatDownloadArea" class="download-area" style="display: none;">
                    <button class="btn btn-success btn-large" onclick="downloadConvertedImage()">📥 下载转换后的图片</button>
                </div>
            </div>
        </div>
    </div>

    <div id="formatLoading" class="overlay hidden">
        <div class="spinner"></div>
        <p id="formatLoadingText">处理中...</p>
    </div>
</div>
`;