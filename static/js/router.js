class Router {
    constructor(routes) {
        this.routes = routes;
        this.currentRoute = null;
        // 每次渲染自增。脚本是异步下载的，若下载期间页面已经切走，
        // 再执行就会把监听器绑到一份已经废弃的 DOM 上——这正是
        // "合并页拖拽没反应、按钮一直禁用"的根因。
        this.renderToken = 0;
        this.sources = {};
        // 页面级清理回调：凡是在 window / document.body 上挂监听器的页面脚本，
        // 都必须在挂载时调用 router.onUnmount() 登记解绑，否则离开页面后监听器
        // 会一直累积（曾经就因此导致"访问过图片转 PDF 后，合并页拖拽彻底失效"）。
        this.cleanups = [];
        // base.html 里静态引入的脚本只执行一次，路由不再重复注入
        this.bootScripts = new Set(
            Array.from(document.scripts).map((node) => this.normalize(node.src)).filter(Boolean)
        );
        this.init();
    }

    normalize(src) {
        if (!src) return '';
        try {
            return new URL(src, window.location.href).pathname;
        } catch (e) {
            return '';
        }
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        // 首屏不必等 load（要等全部脚本与图片加载完）：base.html 里所有脚本都是 defer，
        // DOMContentLoaded 时组件已经定义好了，早一点渲染能少一次明显的白屏等待。
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.handleRoute());
        } else {
            // 构造期间全局 `const router` 还没赋值，而首屏渲染会触发按需加载脚本，
            // 所以推迟到当前脚本执行完之后（此时 router 已初始化）。
            setTimeout(() => this.handleRoute(), 0);
        }
    }

    getHash() {
        const raw = window.location.hash.slice(1) || '/';
        // 只取路径部分，查询串（如 ?cat=image）交给页面自己解析
        return raw.split('?')[0];
    }

    onUnmount(fn) {
        if (typeof fn === 'function') {
            this.cleanups.push(fn);
        }
    }

    runCleanups() {
        const list = this.cleanups;
        this.cleanups = [];
        list.forEach((fn) => {
            try {
                fn();
            } catch (error) {
                console.error('页面清理失败:', error);
            }
        });
    }

    async handleRoute() {
        const hash = this.getHash();
        const route = this.routes.find(r => r.path === hash);

        if (route) {
            // 离开当前页面前，先解绑上一页挂在 window / body 上的监听器
            this.runCleanups();
            this.renderToken++;
            this.currentRoute = route;
            const token = this.renderToken;
            await this.renderRoute(route);
            // 脚本加载期间可能又被切走，此时顶栏要跟着最新一次渲染走
            if (token === this.renderToken) {
                this.updateNav(hash);
            }
        } else {
            const fallback = this.routes.find(r => r.path === '/');
            if (fallback) {
                window.location.hash = '#/';
            }
        }
    }

    async renderRoute(route) {
        const token = this.renderToken;
        // 1) 组件模板先就位：route.component 写成 () => X 就是为了把标识符解析推迟到这里
        if (route.componentScript) {
            await this.loadScript(route.componentScript);
            if (token !== this.renderToken) return;
        }
        // 2) 渲染 DOM
        this.render(route);
        // 3) 页面逻辑脚本最后执行——它们在构造时就会 addEventListener，
        //    早于渲染执行会拿到 null 元素
        for (const src of new Set(route.scripts || [])) {
            await this.loadScript(src);
            if (token !== this.renderToken) return;
        }
    }

    render(route) {
        const app = document.getElementById('app');
        app.innerHTML = typeof route.component === 'function' ? route.component() : route.component;

        if (route.onMount) {
            route.onMount();
        }
    }

    /**
     * 按需执行页面脚本。
     * 与 <script src> 注入的区别：先取源码、再校验页面是否还在，
     * 最后以行内脚本同步执行——不存在"晚到"的执行时机，也不会在 DOM 里
     * 留下需要清理的节点。页面逻辑脚本每次进入都重新执行，因此必须可重跑：
     * 顶层只能用 var / function，出现 const、let、class 会在第二次进入时抛
     * SyntaxError 让整页失效（见 AGENTS.md 约定）。
     */
    loadScript(src) {
        const token = this.renderToken;
        const path = this.normalize(src);
        if (this.bootScripts.has(path)) {
            return Promise.resolve(false);
        }
        if (!this.sources[src]) {
            this.sources[src] = fetch(src)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('脚本加载失败: ' + src + ' (' + response.status + ')');
                    }
                    return response.text();
                })
                .catch((error) => {
                    delete this.sources[src];
                    throw error;
                });
        }
        return this.sources[src].then((text) => {
            if (token !== this.renderToken) {
                return false; // 页面已切走，丢弃
            }
            const node = document.createElement('script');
            node.textContent = text;
            document.body.appendChild(node);
            node.remove();
            return true;
        }).catch((error) => {
            console.error(error);
            if (typeof window.showAppToast === 'function') {
                window.showAppToast('页面脚本加载失败，功能不可用：' + error.message);
            }
            return false;
        });
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
        scripts: ['/static/js/script.js?v=20261019b'],
        component: () => pdfMergeComponent
    },
    {
        path: '/image-to-pdf',
        scripts: ['/static/js/image_to_pdf.js'],
        component: () => imageToPdfComponent
    },
    {
        path: '/json-tool',
        scripts: ['/static/js/json_tool.js'],
        component: () => jsonToolComponent
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
        scripts: ['/static/js/split_pdf.js']
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
        scripts: ['/static/js/md_to_docx.js']
    },
    // IT-Tools 路由
    {
        path: '/text-stats',
        componentScript: '/static/js/it-tools.js',
        component: () => textStatsComponent
    },
    {
        path: '/hash-text',
        componentScript: '/static/js/it-tools.js',
        component: () => hashTextComponent
    },
    {
        path: '/token-gen',
        componentScript: '/static/js/it-tools.js',
        component: () => tokenGenComponent
    },
    {
        path: '/json-yaml',
        componentScript: '/static/js/it-tools.js',
        component: () => jsonYamlComponent
    },
    {
        path: '/bcrypt',
        componentScript: '/static/js/it-tools.js',
        component: () => bcryptComponent
    },
    {
        path: '/encrypt',
        componentScript: '/static/js/it-tools.js',
        component: () => encryptComponent
    },
    {
        path: '/hmac',
        componentScript: '/static/js/it-tools.js',
        component: () => hmacComponent
    },
    {
        path: '/bip39',
        componentScript: '/static/js/it-tools.js',
        component: () => bip39Component
    },
    {
        path: '/uuid',
        componentScript: '/static/js/it-tools.js',
        component: () => uuidComponent
    },
    {
        path: '/ulid',
        componentScript: '/static/js/it-tools.js',
        component: () => ulidComponent
    },
    {
        path: '/git-tools',
        componentScript: '/static/js/it-tools.js',
        component: () => gitToolsComponent
    },
    {
        path: '/boolean',
        componentScript: '/static/js/it-tools.js',
        component: () => booleanComponent
    },
    {
        path: '/url-params',
        componentScript: '/static/js/it-tools.js',
        component: () => urlParamsComponent
    },
    {
        path: '/finalshell',
        componentScript: '/static/js/it-tools.js',
        component: () => finalShellComponent
    },
    {
        path: '/diff',
        componentScript: '/static/js/diff.js',
        scripts: ['/static/js/diff.js'],
        component: () => diffComponent
    },
    {
        path: '/json-formatter',
        componentScript: '/static/js/json-formatter.js',
        component: () => jsonFormatterComponent
    },
    {
        path: '/json-vision',
        componentScript: '/static/js/json-vision.js',
        scripts: ['/static/js/json-vision.js'],
        component: () => jsonVisionComponent
    },
    {
        path: '/image-processor',
        componentScript: '/static/js/image-processor.js',
        component: () => imageProcessorComponent
    },
    {
        path: '/image-format',
        componentScript: '/static/js/image-format-component.js',
        scripts: ['/static/js/image-format.js'],
        component: () => imageFormatComponent
    },
    {
        path: '/image-exif',
        componentScript: '/static/js/image-exif.js',
        component: () => imageExifComponent
    },
    {
        path: '/qrcode-generate',
        componentScript: '/static/js/qrcode-tool-component.js',
        scripts: ['/static/js/qrcode-tool.js'],
        component: () => qrcodeToolComponent
    },
    {
        path: '/qrcode-parse',
        componentScript: '/static/js/qrcode-tool-component.js',
        scripts: ['/static/js/qrcode-tool.js'],
        component: () => qrcodeToolComponent
    },
    {
        path: '/image-idphoto',
        componentScript: '/static/js/image-idphoto-component.js',
        component: () => imageIdPhotoComponent
    },
    {
        path: '/pdf-to-image',
        componentScript: '/static/js/pdf-to-image-component.js',
        component: () => pdfToImageComponent
    },
    {
        path: '/gif-tools',
        componentScript: '/static/js/gif-tool-component.js',
        component: () => gifToolComponent
    }
];

const router = new Router(routes);
