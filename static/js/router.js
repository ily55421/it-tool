class Router {
    constructor(routes) {
        this.routes = routes;
        this.currentRoute = null;
        this.loadedScripts = {};
        this.init();
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        // 首屏不必等 load（要等全部脚本与图片加载完）：base.html 里所有脚本都是 defer，
        // DOMContentLoaded 时组件已经定义好了，早一点渲染能少一次明显的白屏等待。
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.handleRoute());
        } else {
            // 构造期间全局 `const router` 还没赋值，而各页 onMount 会调用 router.loadScript，
            // 所以首屏渲染推迟到当前脚本执行完之后（此时 router 已初始化）。
            setTimeout(() => this.handleRoute(), 0);
        }
    }

    getHash() {
        const raw = window.location.hash.slice(1) || '/';
        // 只取路径部分，查询串（如 ?cat=image）交给页面自己解析
        return raw.split('?')[0];
    }

    handleRoute() {
        const hash = this.getHash();
        const route = this.routes.find(r => r.path === hash);
        
        if (route) {
            // 离开当前页面前，先销毁上一页脚本实例持有的全局监听器。
            if (this.currentRoute && this.currentRoute !== route) {
                if (typeof window.__pdfMergeCleanup === 'function') {
                    try { window.__pdfMergeCleanup(); } catch (e) { /* ignore */ }
                }
            }
            this.unloadRouteScripts();
            this.currentRoute = route;
            this.render(route);
            this.updateNav(hash);
        } else {
            const fallback = this.routes.find(r => r.path === '/');
            if (fallback) {
                window.location.hash = '#/';
            }
        }
    }

    render(route) {
        const app = document.getElementById('app');
        app.innerHTML = route.component;
        
        if (route.onMount) {
            route.onMount();
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            // 同一脚本只执行一次：重复执行会重新声明顶层 const 导致语法错误，
            // 也会让带全局监听器的脚本（如 script.js）产生多份实例。
            this.loadedScripts[src] = this.loadedScripts[src] || { status: 'idle', queue: [] };
            const entry = this.loadedScripts[src];

            if (entry.status === 'loaded') {
                resolve();
                return;
            }
            if (entry.status === 'loading') {
                entry.queue.push({ resolve, reject });
                return;
            }

            // base.html 已经静态引入了某些脚本（如 it-tools.js），再注入一次会因
            // 顶层 const 重复声明而抛 SyntaxError，这里直接视为已加载。
            const baseSrc = src.split('?')[0];
            const alreadyInPage = Array.from(document.scripts).some(
                (node) => node.src && node.src.split('?')[0].endsWith(baseSrc)
            );
            if (alreadyInPage) {
                entry.status = 'loaded';
                resolve();
                return;
            }

            entry.status = 'loading';
            const script = document.createElement('script');
            script.src = src;
            script.dataset.routeScript = src;
            script.onload = () => {
                entry.status = 'loaded';
                resolve();
                entry.queue.forEach((q) => q.resolve());
                entry.queue = [];
            };
            script.onerror = (error) => {
                entry.status = 'idle';
                reject(error);
                entry.queue.forEach((q) => q.reject(error));
                entry.queue = [];
            };
            document.body.appendChild(script);
        });
    }

    /**
     * 路由切换时清理上一页注入的脚本实例。
     * script.js 用 IIFE 维护独立状态，但会把 drop/dragover 等监听器挂在 window 上，
     * 仅移除 <script> 节点不会解绑，旧实例会与新实例同时处理拖拽。
     */
    unloadRouteScripts() {
        document.querySelectorAll('script[data-route-script]').forEach((script) => script.remove());
        this.loadedScripts = {};
    }

    updateNav(currentPath) {
        // 侧边栏已取消，页面归属改由顶栏面包屑呈现
        window.AppCenter.onRoute(currentPath);
    }

    navigate(path) {
        window.location.hash = '#' + path;
    }
}

const pdfMergeComponent = `
    <div class="container pm-page">
        <header>
            <div>
                <h1>📄 PDF 合并工具</h1>
                <p>拖拽上传多个 PDF 文件，缩略图预览、自由排序后一键合并</p>
            </div>
        </header>

        <div class="main-layout">
            <div class="left-panel">
                <div class="upload-area" id="uploadArea" role="button" tabindex="0" aria-label="上传 PDF 文件：点击选择或拖拽文件到页面任意位置">
                    <div class="upload-content">
                        <div class="pm-upload-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m6 9 6-6 6 6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                        </div>
                        <h3 class="pm-upload-title">拖拽 PDF 文件到页面任意位置</h3>
                        <p class="pm-upload-sub">或点击此处选择文件 · 支持多选</p>
                        <div class="pm-upload-chips">
                            <span class="pm-chip">仅支持 .pdf</span>
                            <span class="pm-chip">自动去重</span>
                            <span class="pm-chip">首页缩略图</span>
                        </div>
                        <input type="file" id="fileInput" multiple accept="application/pdf,.pdf" style="display: none;">
                        <button type="button" id="browseBtn">选择文件</button>
                    </div>
                </div>

                <div id="uploadProgress" class="upload-progress hidden">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p id="progressText">上传中...</p>
                </div>

                <div class="file-section">
                    <h2>📑 已上传的文件 <span id="fileCount">(0)</span></h2>
                    <div class="file-list" id="fileList">
                        <div class="empty-state">
                            <p>暂无文件，请上传 PDF 文件</p>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <button id="mergeBtn" class="btn btn-primary" disabled>
                        <span id="mergeBtnText">合并 PDF</span>
                    </button>
                    <button id="clearBtn" class="btn btn-secondary">
                        清空所有
                    </button>
                </div>
            </div>

            <div class="right-panel">
                <div class="preview-header">
                    <h2>👁️ 实时预览</h2>
                    <span id="previewPageCount" class="page-count">0 页</span>
                </div>

                <div id="previewContainer" class="preview-container">
                    <div class="preview-empty-state">
                        <p>上传文件后将显示合并预览</p>
                        <p class="hint">拖动左侧列表可调整合并顺序</p>
                    </div>
                </div>

                <div id="previewSummary" class="preview-summary hidden">
                    <div class="pm-summary-pill">
                        <span class="label">文件数量</span>
                        <span class="value" id="summaryFileCount">0</span>
                    </div>
                    <div class="pm-summary-pill">
                        <span class="label">总页数</span>
                        <span class="value" id="summaryPageCount">0</span>
                    </div>
                    <div class="pm-summary-pill">
                        <span class="label">预估大小</span>
                        <span class="value" id="summarySize">0 B</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 全局拖拽浮层 -->
        <div id="pmGlobalDrop" class="pm-global-drop hidden" aria-hidden="true">
            <div class="pm-global-drop-inner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 16v-5"/><path d="m9.5 13.5 2.5-2.5 2.5 2.5"/></svg>
                <h3>松开鼠标，上传 PDF</h3>
                <p>支持一次拖入多个文件，仅接受 .pdf 格式</p>
            </div>
        </div>

        <!-- Toast 容器 -->
        <div id="pmToastWrap" class="pm-toast-wrap" aria-live="polite"></div>

        <div id="loadingOverlay" class="overlay hidden">
            <div class="spinner"></div>
            <p>正在合并，请稍候…</p>
        </div>

        <!-- 合并命名弹窗 -->
        <div id="pmMergeModal" class="pm-modal hidden" role="dialog" aria-modal="true" aria-labelledby="pmMergeTitle">
            <div class="pm-modal-card">
                <div class="pm-modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M9 12h6"/><path d="m12 9 3 3-3 3"/></svg>
                </div>
                <h3 id="pmMergeTitle">合并 PDF</h3>
                <p class="pm-modal-desc" id="pmMergeDesc"></p>
                <div class="pm-input-group" id="pmMergeNameGroup">
                    <input type="text" id="pmMergeName" maxlength="80" placeholder="merged" spellcheck="false">
                    <span class="pm-ext">.pdf</span>
                </div>
                <p class="pm-field-error hidden" id="pmMergeNameError">文件名不能为空</p>
                <div class="pm-modal-actions">
                    <button type="button" id="pmMergeCancel" class="btn btn-secondary">取消</button>
                    <button type="button" id="pmMergeConfirm" class="btn btn-primary">开始合并</button>
                </div>
            </div>
        </div>

        <!-- 通用确认弹窗 -->
        <div id="pmConfirmModal" class="pm-modal hidden" role="dialog" aria-modal="true">
            <div class="pm-modal-card">
                <div class="pm-modal-icon pm-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                </div>
                <h3 id="pmConfirmTitle">请确认</h3>
                <p class="pm-modal-desc" id="pmConfirmMessage"></p>
                <div class="pm-modal-actions">
                    <button type="button" id="pmConfirmCancel" class="btn btn-secondary">取消</button>
                    <button type="button" id="pmConfirmOk" class="btn btn-primary">确定</button>
                </div>
            </div>
        </div>

        <!-- 合并成功弹窗 -->
        <div id="successModal" class="pm-modal hidden" role="dialog" aria-modal="true">
            <div class="pm-modal-card">
                <div class="pm-modal-icon pm-ok">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>
                </div>
                <h3>合并成功！</h3>
                <p class="pm-modal-desc">你的 PDF 已完成合并，点击下方按钮保存</p>
                <div class="pm-success-file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                    <span id="pmSuccessFile">merged.pdf</span>
                </div>
                <div class="pm-modal-actions">
                    <button type="button" id="closeModal" class="btn btn-secondary">完成</button>
                    <a id="downloadLink" class="btn btn-success" href="#">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>
                        下载 PDF
                    </a>
                </div>
            </div>
        </div>
    </div>
`;

const imageToPdfComponent = `
    <div class="container">
        <header>
            <div>
                <h1>🖼️ 图片转 PDF</h1>
                <p>上传图片，旋转调整后转换为单页 PDF</p>
            </div>
        </header>

        <div class="converter-layout">
            <div class="left-panel">
                <div class="upload-area" id="uploadArea">
                    <div class="upload-content">
                        <div class="upload-icon">📁</div>
                        <h3>拖拽图片到此处</h3>
                        <p>支持 JPG、PNG、GIF、BMP 格式</p>
                        <input type="file" id="fileInput" accept="image/*" style="display: none;">
                        <button type="button" id="browseBtn">选择图片</button>
                    </div>
                </div>

                <div id="imageInfo" class="image-info hidden">
                    <h3>图片信息</h3>
                    <div class="info-item">
                        <span class="label">文件名:</span>
                        <span id="infoFilename">-</span>
                    </div>
                    <div class="info-item">
                        <span class="label">尺寸:</span>
                        <span id="infoDimensions">-</span>
                    </div>
                    <div class="info-item">
                        <span class="label">大小:</span>
                        <span id="infoSize">-</span>
                    </div>
                </div>

                <div id="rotationControls" class="rotation-controls hidden">
                    <h3>旋转调整</h3>
                    <div class="rotation-buttons">
                        <button type="button" id="rotateLeft" class="btn-rotate">
                            ↺ 左旋 90°
                        </button>
                        <button type="button" id="rotateRight" class="btn-rotate">
                            ↻ 右旋 90°
                        </button>
                        <button type="button" id="rotateCustom" class="btn-rotate">
                            🔄 自定义角度
                        </button>
                        <button type="button" id="resetRotation" class="btn-rotate">
                            ↩ 重置
                        </button>
                    </div>
                    <div class="rotation-display">
                        <span class="label">当前旋转:</span>
                        <span id="rotationValue">0°</span>
                    </div>
                </div>

                <div id="outputControls" class="output-controls hidden">
                    <h3>输出设置</h3>
                    <div class="input-group">
                        <label for="outputFilename">PDF 文件名:</label>
                        <input type="text" id="outputFilename" value="converted" placeholder="输入文件名">
                        <span class="extension">.pdf</span>
                    </div>
                </div>

                <div id="actionButtons" class="actions hidden">
                    <button id="convertBtn" class="btn btn-primary">
                        📄 转换为 PDF
                    </button>
                    <button id="clearBtn" class="btn btn-secondary">
                        🗑️ 清空
                    </button>
                </div>
            </div>

            <div class="right-panel">
                <div class="preview-header">
                    <h2>👁️ 预览</h2>
                    <span id="previewDimensions" class="page-count">-</span>
                </div>
                
                <div id="previewContainer" class="preview-container">
                    <div class="preview-empty-state">
                        <div class="preview-icon">🖼️</div>
                        <p>上传图片后将显示预览</p>
                        <p class="hint">支持旋转调整预览效果</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="loadingOverlay" class="overlay hidden">
            <div class="spinner"></div>
            <p id="loadingText">处理中...</p>
        </div>

        <div id="successModal" class="modal hidden">
            <div class="modal-content">
                <h3>🎉 转换成功！</h3>
                <p>图片已成功转换为 PDF</p>
                <a id="downloadLink" class="btn btn-success" target="_blank">
                    📥 下载 PDF
                </a>
                <button id="closeModal" class="btn btn-secondary">
                    关闭
                </button>
            </div>
        </div>

        <div id="customRotationModal" class="modal hidden">
            <div class="modal-content modal-small">
                <h3>自定义旋转角度</h3>
                <div class="input-group">
                    <label for="customAngle">旋转角度:</label>
                    <input type="number" id="customAngle" value="0" min="-360" max="360" placeholder="输入角度">
                    <span class="extension">°</span>
                </div>
                <div class="modal-actions">
                    <button id="applyCustomRotation" class="btn btn-primary">应用</button>
                    <button id="cancelCustomRotation" class="btn btn-secondary">取消</button>
                </div>
            </div>
        </div>
    </div>
`;

const jsonToolComponent = `
    <div class="container">
        <header>
            <div>
                <h1>JSON 序列化工具</h1>
                <p>将字符串解析为标准 JSON 对象，并输出格式化结果</p>
            </div>
        </header>

        <div class="json-tool-layout">
            <section class="json-panel">
                <div class="json-panel-header">
                    <h2>输入 JSON 字符串</h2>
                    <button type="button" id="loadJsonSampleBtn" class="btn btn-secondary">示例</button>
                </div>
                <textarea id="jsonInput" class="json-editor" spellcheck="false" placeholder='例如: {"name":"Tom","age":18}'></textarea>
                <div class="json-options">
                    <label class="json-option">
                        <input type="checkbox" id="sortKeys">
                        <span>按键名排序</span>
                    </label>
                    <label class="json-option">
                        <input type="checkbox" id="ensureAscii">
                        <span>转义非 ASCII 字符</span>
                    </label>
                    <label class="json-indent-option" for="jsonIndent">
                        <span>缩进</span>
                        <input type="number" id="jsonIndent" min="0" max="8" value="2">
                    </label>
                </div>
                <div class="actions json-actions">
                    <button type="button" id="parseJsonBtn" class="btn btn-primary">转换</button>
                    <button type="button" id="clearJsonBtn" class="btn btn-secondary">清空</button>
                </div>
            </section>

            <section class="json-panel">
                <div class="json-panel-header">
                    <h2>标准 JSON 对象</h2>
                    <span id="jsonTypeBadge" class="json-type-badge">未解析</span>
                </div>
                <pre id="jsonOutput" class="json-output">等待输入 JSON 字符串</pre>
                <div id="jsonMessage" class="json-message" aria-live="polite"></div>
                <div class="actions json-actions">
                    <button type="button" id="copyJsonBtn" class="btn btn-primary" disabled>复制格式化结果</button>
                    <button type="button" id="copyCompactJsonBtn" class="btn btn-secondary" disabled>复制压缩结果</button>
                </div>
            </section>
        </div>
    </div>
`;

const appCenterRoute = {
    path: '/apps',
    component: appCenterComponent,
    onMount: () => window.AppCenter.mount()
};

const routes = [
    appCenterRoute,
    { ...appCenterRoute, path: '/' },
    {
        path: '/pdf-merge',
        component: pdfMergeComponent,
        onMount: () => {
            router.loadScript('/static/js/script.js?v=20261019b');
        }
    },
    {
        path: '/image-to-pdf',
        component: imageToPdfComponent,
        onMount: () => {
            router.loadScript('/static/js/image_to_pdf.js');
        }
    },
    {
        path: '/json-tool',
        component: jsonToolComponent,
        onMount: () => {
            router.loadScript('/static/js/json_tool.js');
        }
    },
    {
        path: '/split-pdf',
        component: `
<div class="container">
    <header>
        <div>
            <h1>✂️ PDF 拆分工具</h1>
            <p>支持 PDF、MOBI、EPUB 格式，上传后自动转换并拆分</p>
        </div>
    </header>

    <main>
        <section class="upload-section">
            <h2>1. 上传文件</h2>
            <div class="upload-area" id="uploadArea">
                <div class="upload-icon">📄</div>
                <p class="upload-text">点击或拖拽文件到此处</p>
                <p class="upload-hint">支持格式: PDF、MOBI、EPUB</p>
                <input type="file" id="fileInput" accept=".pdf,.mobi,.epub" hidden>
            </div>
            <div class="file-info" id="fileInfo" style="display: none;">
                <div class="info-card">
                    <div class="info-item">
                        <span class="info-label">文件名:</span>
                        <span class="info-value" id="fileName"></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">文件类型:</span>
                        <span class="info-value" id="fileType"></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">文件大小:</span>
                        <span class="info-value" id="fileSize"></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">预估页数:</span>
                        <span class="info-value" id="totalPages"></span>
                    </div>
                </div>
            </div>
        </section>

        <section class="convert-section" id="convertSection" style="display: none;">
            <h2>2. 转换为PDF</h2>
            <div class="convert-config">
                <p class="convert-hint">MOBI/EPUB文件需要转换为PDF后才能进行拆分</p>
                <button class="btn btn-primary" id="convertBtn">开始转换</button>
            </div>
        </section>

        <section class="split-section" id="splitSection" style="display: none;">
            <h2>3. 设置拆分参数</h2>
            <div class="split-config">
                <div class="input-group">
                    <label for="pagesPerSplit">每份PDF包含的页数:</label>
                    <input type="number" id="pagesPerSplit" min="1" value="1" placeholder="输入每份的页数">
                </div>
                <div class="preview-info" id="previewInfo"></div>
                <button class="btn btn-primary" id="splitBtn">开始拆分</button>
            </div>
        </section>

        <section class="result-section" id="resultSection" style="display: none;">
            <h2>4. 拆分结果</h2>
            <div class="result-info" id="resultInfo"></div>
            <div class="file-list" id="fileList"></div>
            <button class="btn btn-secondary" id="resetBtn">重新上传</button>
        </section>

        <div class="loading" id="loading" style="display: none;">
            <div class="spinner"></div>
            <p id="loadingText">处理中...</p>
        </div>
    </main>
</div>
`,
        onMount: () => {
            router.loadScript('/static/js/split_pdf.js');
        }
    },
    {
        path: '/md-to-word',
        component: `
<div class="container">
    <header>
        <div>
            <h1>📝 Markdown 转 Word</h1>
            <p>上传 Markdown 文件或直接编辑，一键转换为 Word 文档</p>
        </div>
    </header>

    <main>
        <section id="uploadSection">
            <h2>1. 上传文件或输入内容</h2>
            <div class="upload-area" id="uploadArea">
                <div class="upload-icon">📄</div>
                <p class="upload-text">点击或拖拽 Markdown 文件到此处</p>
                <p class="upload-hint">支持格式: .md、.txt</p>
                <input type="file" id="fileInput" accept=".md,.txt" hidden>
            </div>
            <p class="info-text">或者点击下方按钮加载示例内容进行测试</p>
            <button class="btn btn-secondary" id="loadSampleBtn">📋 加载示例内容</button>
        </section>

        <div id="fileInfo" style="display: none;">
            <div class="info-card">
                <div class="info-item">
                    <span class="info-label">文件名:</span>
                    <span class="info-value" id="fileName"></span>
                </div>
                <div class="info-item">
                    <span class="info-label">文件大小:</span>
                    <span class="info-value" id="fileSize"></span>
                </div>
            </div>
        </div>

        <section id="editorSection" style="display: none;">
            <h2>2. 编辑 Markdown 内容</h2>
            <div class="editor-container">
                <div class="editor-header">
                    <span class="char-count">字数: <span id="charCount">0</span></span>
                    <span class="word-count">单词: <span id="wordCount">0</span></span>
                </div>
                <textarea id="mdEditor" placeholder="在此输入或粘贴 Markdown 内容..."></textarea>
            </div>
            <div class="editor-actions">
                <button class="btn btn-primary" id="convertBtn">📄 转换为 Word</button>
                <button class="btn btn-secondary" id="resetBtn">🔄 重新开始</button>
            </div>
        </section>

        <section id="resultSection" style="display: none;">
            <h2>3. 转换结果</h2>
            <div class="result-card">
                <div class="result-info">
                    <div class="result-item">
                        <span class="result-label">生成文件:</span>
                        <span class="result-value" id="resultFileName"></span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">文件大小:</span>
                        <span class="result-value" id="resultFileSize"></span>
                    </div>
                </div>
                <a href="#" id="downloadLink" class="btn btn-success" download>
                    📥 下载 Word 文档
                </a>
                <button class="btn btn-secondary" id="resetBtn">🔄 再转换一个</button>
            </div>
        </section>

        <div class="loading" id="loading" style="display: none;">
            <div class="spinner"></div>
            <p id="loadingText">处理中...</p>
        </div>
    </main>
</div>
`,
        onMount: () => {
            router.loadScript('/static/js/md_to_docx.js');
        }
    },
    // IT-Tools 路由
    {
        path: '/text-stats',
        component: textStatsComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/hash-text',
        component: hashTextComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/token-gen',
        component: tokenGenComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/json-yaml',
        component: jsonYamlComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/bcrypt',
        component: bcryptComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/encrypt',
        component: encryptComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/hmac',
        component: hmacComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/bip39',
        component: bip39Component,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/uuid',
        component: uuidComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/ulid',
        component: ulidComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/git-tools',
        component: gitToolsComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/boolean',
        component: booleanComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/url-params',
        component: urlParamsComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/finalshell',
        component: finalShellComponent,
        onMount: () => {
            router.loadScript('/static/js/it-tools.js');
        }
    },
    {
        path: '/diff',
        component: diffComponent,
        onMount: () => {
            router.loadScript('/static/js/diff.js');
        }
    },
    {
        path: '/json-formatter',
        component: jsonFormatterComponent
    },
    {
        path: '/json-vision',
        component: jsonVisionComponent,
        onMount: () => {
            router.loadScript('/static/js/json-vision.js');
        }
    },
    {
        path: '/image-processor',
        component: imageProcessorComponent
    },
    {
        path: '/image-format',
        component: imageFormatComponent,
        onMount: () => {
            router.loadScript('/static/js/image-format.js');
        }
    },
    {
            path: '/image-exif',
            component: imageExifComponent
        },
    {
        path: '/qrcode-generate',
        component: qrcodeToolComponent,
        onMount: () => {
            router.loadScript('/static/js/qrcode-tool.js');
        }
    },
    {
        path: '/qrcode-parse',
        component: qrcodeToolComponent,
        onMount: () => {
            router.loadScript('/static/js/qrcode-tool.js');
        }
    },
    {
        path: '/image-idphoto',
        component: imageIdPhotoComponent
    },
    {
        path: '/pdf-to-image',
        component: pdfToImageComponent
    },
    {
        path: '/gif-tools',
        component: gifToolComponent
    }
];

const router = new Router(routes);
