/* ============================================================
 * PDF 合并工具 —— 前端交互（重写版）
 *  - 全页面拖拽上传 + 实时进度
 *  - 首页缩略图预览（后端 /thumbnail）
 *  - Toast / 自定义弹窗替代 alert / confirm / prompt
 *  - 拖拽排序不重绘列表，顺序角标原地刷新
 * ============================================================ */
(function () {
    'use strict';

    var PAGE_CSS_HREF = '/static/css/pdf-merge.css?v=20261019b';
    var state = {
        files: [],            // { id, filename, info: {pages, size, title} }
        sortable: null,
        thumbCache: new Map(),// id -> objectURL（加载失败记为 'fallback'）
        previewTimer: null,
        dragDepth: 0,
        uploading: false
    };
    var el = {};

    /* ---------- 上一实例清理（路由反复挂载防泄漏） ---------- */
    if (window.__pdfMergeCleanup) {
        try { window.__pdfMergeCleanup(); } catch (e) { /* ignore */ }
    }

    /* ---------- 小工具 ---------- */
    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        var v = bytes / Math.pow(1024, i);
        return (v >= 100 ? Math.round(v) : v.toFixed(1)) + ' ' + units[i];
    }

    function sanitizeFilename(name) {
        return String(name || '').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
    }

    /* ---------- 图标 ---------- */
    var ICON = {
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m6 9 6-6 6 6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
        grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
        file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
        folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>',
        alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
        merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M9 12h6"/><path d="m12 9 3 3-3 3"/></svg>',
        zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>'
    };

    /* ---------- 页面样式按需注入 ---------- */
    function ensureStyles() {
        if (!document.querySelector('link[data-pm-style]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = PAGE_CSS_HREF;
            link.setAttribute('data-pm-style', '1');
            document.head.appendChild(link);
        }
    }

    /* ---------- Toast ---------- */
    function toast(opts) {
        var msg = typeof opts === 'string' ? opts : opts.message;
        var type = (opts && opts.type) || 'info';
        var duration = (opts && opts.duration) || 3400;
        var actionLabel = opts && opts.actionLabel;
        var onAction = opts && opts.onAction;

        var wrap = $('pmToastWrap');
        if (!wrap) return;

        var item = document.createElement('div');
        item.className = 'pm-toast pm-' + type;
        item.setAttribute('role', 'status');
        item.innerHTML =
            (type === 'success' ? ICON.check : type === 'error' || type === 'warn' ? ICON.alert : ICON.eye) +
            '<span class="pm-toast-msg">' + esc(msg) + '</span>' +
            (actionLabel ? '<button type="button" class="pm-toast-action">' + esc(actionLabel) + '</button>' : '');
        wrap.appendChild(item);

        var closed = false;
        function close() {
            if (closed) return;
            closed = true;
            item.classList.add('pm-out');
            setTimeout(function () { item.remove(); }, 240);
        }

        if (actionLabel) {
            item.querySelector('.pm-toast-action').addEventListener('click', function () {
                close();
                if (typeof onAction === 'function') onAction();
            });
        }
        setTimeout(close, duration);
    }

    /* ---------- 弹窗基类 ---------- */
    function openModal(node) {
        node.classList.remove('hidden');
        var first = node.querySelector('input, button');
        if (first) setTimeout(function () { first.focus(); }, 60);
    }

    function closeModal(node) {
        node.classList.add('hidden');
    }

    /* 确认弹窗：返回 Promise<boolean> */
    function confirmDialog(opts) {
        return new Promise(function (resolve) {
            var modal = $('pmConfirmModal');
            if (!modal) { resolve(window.confirm(opts.message || '')); return; }
            $('pmConfirmTitle').textContent = opts.title || '请确认';
            $('pmConfirmMessage').textContent = opts.message || '';
            $('pmConfirmOk').textContent = opts.okText || '确定';
            $('pmConfirmOk').className = 'btn ' + (opts.danger ? 'pm-btn-danger btn-primary' : 'btn-primary');
            $('pmConfirmCancel').textContent = opts.cancelText || '取消';

            function done(val) {
                closeModal(modal);
                $('pmConfirmOk').removeEventListener('click', onOk);
                $('pmConfirmCancel').removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKey);
                resolve(val);
            }
            function onOk() { done(true); }
            function onCancel() { done(false); }
            function onBackdrop(e) { if (e.target === modal) done(false); }
            function onKey(e) { if (e.key === 'Escape') done(false); }

            $('pmConfirmOk').addEventListener('click', onOk);
            $('pmConfirmCancel').addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKey);
            openModal(modal);
        });
    }

    /* 合并命名弹窗：返回 Promise<string|null> */
    function promptMergeName(defaultName, descText) {
        return new Promise(function (resolve) {
            var modal = $('pmMergeModal');
            if (!modal) {
                var v = window.prompt('请输入合并后的文件名（不含扩展名）:', defaultName);
                resolve(v ? sanitizeFilename(v) : null);
                return;
            }
            var input = $('pmMergeName');
            var group = $('pmMergeNameGroup');
            var err = $('pmMergeNameError');
            $('pmMergeDesc').textContent = descText || '';
            input.value = defaultName;

            function done(val) {
                closeModal(modal);
                input.removeEventListener('keydown', onKey);
                $('pmMergeConfirm').removeEventListener('click', onOk);
                $('pmMergeCancel').removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onEsc);
                resolve(val);
            }
            function submit() {
                var name = sanitizeFilename(input.value);
                if (!name) {
                    group.classList.add('pm-invalid');
                    err.classList.remove('hidden');
                    input.focus();
                    return;
                }
                done(name);
            }
            function onOk() { submit(); }
            function onCancel() { done(null); }
            function onBackdrop(e) { if (e.target === modal) done(null); }
            function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }
            function onEsc(e) { if (e.key === 'Escape') done(null); }

            input.addEventListener('input', function () {
                group.classList.remove('pm-invalid');
                err.classList.add('hidden');
            });
            input.addEventListener('keydown', onKey);
            $('pmMergeConfirm').addEventListener('click', onOk);
            $('pmMergeCancel').addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onEsc);
            openModal(modal);
            setTimeout(function () {
                input.focus();
                var dot = input.value.lastIndexOf('.');
                input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
            }, 80);
        });
    }

    /* ---------- 缩略图 ---------- */
    function thumbURL(id) {
        return '/thumbnail/' + encodeURIComponent(id) + '?page=0';
    }

    function applyThumb(img, id) {
        var cached = state.thumbCache.get(id);
        if (cached === 'fallback') {
            replaceWithFallback(img);
            return;
        }
        if (cached) {
            img.src = cached;
            return;
        }
        img.addEventListener('error', function onError() {
            img.removeEventListener('error', onError);
            replaceWithFallback(img);
        });
        img.src = thumbURL(id);
        img.addEventListener('load', function onLoad() {
            img.removeEventListener('load', onLoad);
            try {
                state.thumbCache.set(id, img.src);
            } catch (e) { /* ignore */ }
        });
    }

    function replaceWithFallback(img) {
        state.thumbCache.set(img.dataset.fileId, 'fallback');
        var fb = document.createElement('div');
        fb.className = 'pm-thumb-fallback';
        fb.textContent = 'PDF';
        img.replaceWith(fb);
    }

    /* ---------- 列表渲染 ---------- */
    function renderFileList() {
        if (!el.fileList) return;
        var count = $('fileCount');
        if (count) count.textContent = '(' + state.files.length + ')';

        if (state.files.length === 0) {
            el.fileList.innerHTML =
                '<div class="empty-state">' + ICON.folder +
                '<p>暂无文件，拖拽 PDF 到上方区域即可添加</p></div>';
            if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
            return;
        }

        el.fileList.innerHTML = state.files.map(function (file, index) {
            var pages = file.info && file.info.pages ? file.info.pages : '-';
            var size = file.info ? fmtSize(file.info.size) : '';
            return (
                '<div class="pm-file-item" data-file-id="' + esc(file.id) + '">' +
                    '<span class="pm-drag-handle" title="拖拽调整顺序">' + ICON.grip + '</span>' +
                    '<span class="pm-order-badge">' + (index + 1) + '</span>' +
                    '<img class="pm-thumb" data-file-id="' + esc(file.id) + '" alt="缩略图" draggable="false">' +
                    '<div class="pm-file-info">' +
                        '<div class="pm-file-name" title="' + esc(file.filename) + '">' + esc(file.filename) + '</div>' +
                        '<div class="pm-file-meta">' +
                            '<span class="pm-meta-tag">' + pages + ' 页</span>' +
                            '<span class="pm-meta-tag">' + esc(size) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="pm-remove-btn" title="移除该文件" aria-label="移除 ' + esc(file.filename) + '">' + ICON.trash + '</button>' +
                '</div>'
            );
        }).join('');

        // 缩略图
        el.fileList.querySelectorAll('img.pm-thumb').forEach(function (img) {
            applyThumb(img, img.dataset.fileId);
        });
        // 缩略图加载失败的兜底
        el.fileList.querySelectorAll('img.pm-thumb').forEach(function (img) {
            if (state.thumbCache.get(img.dataset.fileId) === 'fallback') replaceWithFallback(img);
        });

        // 删除按钮
        el.fileList.querySelectorAll('.pm-remove-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var item = btn.closest('.pm-file-item');
                if (item) removeFile(item.dataset.fileId);
            });
        });

        initSortable();
    }

    /* 拖拽结束后仅刷新角标，不重建 DOM */
    function refreshOrderBadges() {
        if (!el.fileList) return;
        el.fileList.querySelectorAll('.pm-file-item').forEach(function (item, i) {
            var badge = item.querySelector('.pm-order-badge');
            if (badge) badge.textContent = String(i + 1);
        });
    }

    /* ---------- 排序 ---------- */
    function initSortable() {
        if (!el.fileList || state.sortable) return;
        // Sortable 按需加载：只有真的上传了文件、需要拖拽排序时才下载
        ITLibs.load('sortable').then(function () {
            if (!el.fileList || state.sortable || typeof Sortable === 'undefined') return;
            state.sortable = new Sortable(el.fileList, {
                animation: 180,
                easing: 'cubic-bezier(0.2, 0, 0, 1)',
                handle: '.pm-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                filter: '.pm-remove-btn',
                preventOnFilter: false,
                onEnd: function (evt) {
                    var oldIndex = evt.oldIndex, newIndex = evt.newIndex;
                    if (oldIndex === newIndex || oldIndex == null || newIndex == null) return;
                    var moved = state.files.splice(oldIndex, 1)[0];
                    state.files.splice(newIndex, 0, moved);
                    refreshOrderBadges();
                    updatePreview();
                }
            });
        }).catch(function (error) {
            console.error('拖拽排序组件加载失败:', error);
        });
    }

    /* ---------- 全页面拖拽上传 ---------- */
    function hasFiles(e) {
        var dt = e.dataTransfer;
        var types = dt && dt.types ? dt.types : [];
        for (var i = 0; i < types.length; i++) {
            if (types[i] === 'Files') return true;
        }
        return false;
    }

    function setupGlobalDragDrop() {
        var overlay = $('pmGlobalDrop');

        function showOverlay() { if (overlay) overlay.classList.remove('hidden'); }
        function hideOverlay() { if (overlay) overlay.classList.add('hidden'); }

        function onDragEnter(e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            state.dragDepth++;
            showOverlay();
        }
        function onDragOver(e) {
            if (!hasFiles(e)) return;
            e.preventDefault(); // 允许 drop
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }
        function onDragLeave(e) {
            if (!hasFiles(e)) return;
            state.dragDepth = Math.max(0, state.dragDepth - 1);
            if (state.dragDepth === 0) hideOverlay();
        }
        function onDrop(e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            state.dragDepth = 0;
            hideOverlay();
            if (e.dataTransfer && e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
        }
        // 阻止浏览器默认的"打开文件"行为，拖到页面任意位置都不会跳走。
        function onBodyDragOver(e) { e.preventDefault(); }

        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', onDrop);
        document.body.addEventListener('dragover', onBodyDragOver);

        function cleanup() {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('drop', onDrop);
            document.body.removeEventListener('dragover', onBodyDragOver);
            if (state.sortable) { try { state.sortable.destroy(); } catch (e) { /* ignore */ } }
            document.querySelectorAll('.pm-toast-wrap, .pm-zoom-layer').forEach(function (n) { n.remove(); });
        }

        // 每个实例都把自己的解绑函数登记进列表：只保留"最后一个 cleanup"的话，
        // 早先实例挂在 window 上的监听器会永远留在页面上，抢走拖拽事件。
        window.__pdfMergeCleanups = window.__pdfMergeCleanups || [];
        window.__pdfMergeCleanups.push(cleanup);
        window.__pdfMergeCleanup = function () {
            var list = window.__pdfMergeCleanups || [];
            window.__pdfMergeCleanups = [];
            list.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
        };
    }

    function setupUploadArea() {
        var area = el.uploadArea;
        if (!area) return;

        area.addEventListener('click', function (e) {
            if (e.target.closest('#browseBtn')) return;
            el.fileInput.click();
        });
        area.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.fileInput.click();
            }
        });

        el.browseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            el.fileInput.click();
        });

        el.fileInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files.length) {
                handleFiles(e.target.files);
            }
            e.target.value = '';
        });
    }

    /* ---------- 文件筛选 / 去重 / 上传 ---------- */
    function filterPdfFiles(fileList) {
        var accepted = [], rejected = [];
        Array.prototype.forEach.call(fileList, function (f) {
            var isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
            if (isPdf) accepted.push(f); else rejected.push(f);
        });
        return { accepted: accepted, rejected: rejected };
    }

    function dedupe(candidates) {
        var seen = new Set(state.files.map(function (f) { return f.filename + '|' + (f.info ? f.info.size : 0); }));
        var kept = [], dupNames = [];
        candidates.forEach(function (f) {
            var key = f.name + '|' + f.size;
            if (seen.has(key)) { dupNames.push(f.name); return; }
            seen.add(key);
            kept.push(f);
        });
        return { kept: kept, dupNames: dupNames };
    }

    function xhrUpload(formData, onProgress) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload');
            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
            });
            xhr.addEventListener('load', function () {
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
                if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
                    resolve(data);
                } else {
                    reject(new Error((data && data.error) || ('服务器返回 ' + xhr.status)));
                }
            });
            xhr.addEventListener('error', function () { reject(new Error('网络错误，上传失败')); });
            xhr.addEventListener('abort', function () { reject(new Error('上传已取消')); });
            xhr.send(formData);
        });
    }

    async function handleFiles(fileList) {
        if (state.uploading) { toast({ message: '正在上传中，请稍候', type: 'warn' }); return; }

        var picked = filterPdfFiles(fileList);
        if (picked.rejected.length) {
            toast({ message: '已跳过非 PDF 文件：' + picked.rejected.map(function (f) { return f.name; }).join('、'), type: 'warn', duration: 4200 });
        }
        if (!picked.accepted.length) return;

        var deduped = dedupe(picked.accepted);
        if (deduped.dupNames.length) {
            toast({ message: '已跳过重复文件：' + deduped.dupNames.join('、'), type: 'info', duration: 3800 });
        }
        if (!deduped.kept.length) return;

        var formData = new FormData();
        deduped.kept.forEach(function (f) { formData.append('files', f); });

        state.uploading = true;
        showProgress(0, 1, deduped.kept.length);
        try {
            var data = await xhrUpload(formData, function (loaded, total) {
                showProgress(loaded, total, deduped.kept.length);
            });

            // 保留现有顺序，新文件追加到末尾
            var existingIds = new Set(state.files.map(function (f) { return f.id; }));
            var fresh = (data.files || []).filter(function (f) { return !existingIds.has(f.id); });
            state.files = state.files.concat(fresh);

            if (data.rejected && data.rejected.length) {
                toast({ message: '以下文件不是有效 PDF，已被忽略：' + data.rejected.map(function (r) { return r.filename; }).join('、'), type: 'warn', duration: 4500 });
            }

            renderFileList();
            updatePreview();
            if (fresh.length) {
                toast({ message: '已添加 ' + fresh.length + ' 个 PDF 文件', type: 'success' });
            } else {
                toast({ message: '没有新增文件', type: 'info' });
            }
        } catch (err) {
            toast({ message: '上传失败：' + err.message, type: 'error', duration: 4500 });
        } finally {
            state.uploading = false;
            hideProgress();
            // 必须在上传状态复位之后再刷新，否则按钮会按 uploading=true 被禁用且无人再恢复。
            updateActions();
        }
    }

    function showProgress(loaded, total, fileCount) {
        var wrap = el.uploadProgress;
        if (!wrap) return;
        wrap.classList.remove('hidden');
        var pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        el.progressFill.style.width = pct + '%';
        el.progressText.textContent = pct >= 100
            ? '服务器处理中…（' + fileCount + ' 个文件）'
            : '上传中 ' + pct + '% · ' + fmtSize(loaded) + ' / ' + fmtSize(total);
    }

    function hideProgress() {
        if (!el.uploadProgress) return;
        el.uploadProgress.classList.add('hidden');
        el.progressFill.style.width = '0%';
    }

    /* ---------- 移除 / 清空 ---------- */
    function removeFile(fileId) {
        var index = state.files.findIndex(function (f) { return f.id === fileId; });
        if (index < 0) return;

        var removed = state.files[index];
        var item = el.fileList.querySelector('.pm-file-item[data-file-id="' + CSS.escape(fileId) + '"]');

        var doRemove = function () {
            state.files.splice(index, 1);
            renderFileList();
            updatePreview();
            updateActions();
        };

        if (item) {
            item.classList.add('pm-removing');
            setTimeout(doRemove, 200);
        } else {
            doRemove();
        }

        toast({
            message: '已移除 ' + removed.filename,
            type: 'info',
            duration: 5000,
            actionLabel: '撤销',
            onAction: function () {
                state.files.splice(Math.min(index, state.files.length), 0, removed);
                renderFileList();
                updatePreview();
                updateActions();
            }
        });
    }

    async function clearAllFiles() {
        if (state.files.length === 0) return;
        var ok = await confirmDialog({
            title: '清空所有文件？',
            message: '将删除已上传的 ' + state.files.length + ' 个 PDF，此操作不可恢复。',
            okText: '清空',
            danger: true
        });
        if (!ok) return;

        try {
            await fetch('/cleanup', { method: 'POST' });
        } catch (e) { /* 服务器清理失败也不阻塞前端重置 */ }

        state.files.forEach(function (f) {
            var u = state.thumbCache.get(f.id);
            if (u && u !== 'fallback') { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }
        });
        state.thumbCache.clear();
        state.files = [];
        renderFileList();
        renderPreviewEmpty();
        updateSummary(0);
        updateActions();
        toast({ message: '已清空所有文件', type: 'success' });
    }

    /* ---------- 预览 ---------- */
    function updatePreview() {
        if (state.previewTimer) clearTimeout(state.previewTimer);
        state.previewTimer = setTimeout(fetchPreview, 300);
    }

    async function fetchPreview() {
        if (state.files.length === 0) {
            renderPreviewEmpty();
            updateSummary(0);
            return;
        }

        var container = el.previewContainer;
        if (!container) return;
        container.classList.add('pm-preview-loading');

        try {
            var resp = await fetch('/preview-merged', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_ids: state.files.map(function (f) { return f.id; }) })
            });
            var data = await resp.json();
            if (!data.success) throw new Error(data.error || '预览生成失败');

            container.classList.remove('pm-preview-loading');
            container.classList.remove('pm-page-error');
            displayPreview(data.preview, data.total_pages);
            updateSummary(data.total_pages);
        } catch (err) {
            container.classList.remove('pm-preview-loading');
            container.classList.remove('has-preview');
            container.innerHTML =
                '<div class="pm-preview-error">' + ICON.alert +
                '<p>' + esc(err.message || '预览加载失败') + '</p>' +
                '<button type="button" id="pmRetryPreview">' + ICON.refresh + ' 重试</button></div>';
            var retry = $('pmRetryPreview');
            if (retry) retry.addEventListener('click', function () { updatePreview(); });
        }
    }

    function displayPreview(previewData, totalPages) {
        var container = el.previewContainer;
        var pageCount = el.previewPageCount;
        if (!container) return;

        if (pageCount) pageCount.textContent = totalPages + ' 页';
        container.classList.add('has-preview');

        container.innerHTML = previewData.map(function (file, index) {
            var stateFile = state.files[index];
            var displayName = (file && file.filename) || (stateFile && stateFile.filename) || ('文件 ' + (index + 1));
            return (
                '<div class="pm-preview-card" data-index="' + index + '">' +
                    '<div class="pm-preview-card-head">' +
                        '<span class="pm-preview-num">' + (index + 1) + '</span>' +
                        '<span class="pm-preview-name" title="' + esc(displayName) + '">' + esc(displayName) + '</span>' +
                    '</div>' +
                    '<div class="pm-preview-body" title="点击放大查看">' +
                        '<div class="pm-skeleton"></div>' +
                    '</div>' +
                    '<div class="pm-preview-foot">' +
                        '<span class="pm-range-tag">合并后第 ' + esc(file.page_range) + ' 页</span>' +
                        '<span class="pm-pages-tag">' + file.pages + ' 页</span>' +
                    '</div>' +
                '</div>'
            );
        }).join('');

        // 每张卡片填充缩略图（复用 /thumbnail 接口与缓存）
        container.querySelectorAll('.pm-preview-card').forEach(function (card) {
            var index = Number(card.dataset.index);
            var file = state.files[index];
            var body = card.querySelector('.pm-preview-body');
            if (!file || !body) return;

            var cached = state.thumbCache.get(file.id);
            if (cached === 'fallback') {
                body.innerHTML = renderFallbackBody();
                return;
            }

            var img = document.createElement('img');
            img.alt = '第 ' + (index + 1) + ' 个文件首页预览';
            img.draggable = false;
            img.addEventListener('load', function () {
                var sk = body.querySelector('.pm-skeleton');
                if (sk) sk.remove();
                if (!state.thumbCache.get(file.id)) {
                    try { state.thumbCache.set(file.id, img.src); } catch (e) { /* ignore */ }
                }
            });
            img.addEventListener('error', function () {
                body.innerHTML = renderFallbackBody();
            });

            var source = cached || thumbURL(file.id);
            img.src = source;
            body.appendChild(img);

            body.addEventListener('click', function () {
                if (!state.thumbCache.get(file.id) || state.thumbCache.get(file.id) === 'fallback') return;
                openZoom(img.src, file.filename);
            });
        });
    }

    function renderFallbackBody() {
        return '<div class="pm-thumb-fallback">' + ICON.file + '<span>无缩略图</span></div>';
    }

    function openZoom(src, name) {
        var layer = document.createElement('div');
        layer.className = 'pm-zoom-layer';
        layer.innerHTML = '<img alt="预览大图" src="' + src + '">' +
            '<div class="pm-zoom-caption">' + esc(name || '') + '（点击任意处关闭）</div>';
        layer.addEventListener('click', function () { layer.remove(); });
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { layer.remove(); document.removeEventListener('keydown', onEsc); }
        });
        document.body.appendChild(layer);
    }

    function renderPreviewEmpty() {
        var container = el.previewContainer;
        var pageCount = el.previewPageCount;
        if (!container) return;
        if (pageCount) pageCount.textContent = '0 页';
        container.classList.remove('has-preview');
        container.innerHTML =
            '<div class="preview-empty-state">' + ICON.file +
            '<p>上传文件后将显示合并预览</p>' +
            '<p class="hint">拖动左侧列表可调整合并顺序</p></div>';
    }

    function updateSummary(totalPages) {
        var summary = el.previewSummary;
        if (!summary) return;
        if (!state.files.length) {
            summary.classList.add('hidden');
            return;
        }
        summary.classList.remove('hidden');
        $('summaryFileCount').textContent = state.files.length;
        $('summaryPageCount').textContent = totalPages;
        var totalSize = state.files.reduce(function (sum, f) { return sum + (f.info ? f.info.size || 0 : 0); }, 0);
        $('summarySize').textContent = fmtSize(totalSize);
    }

    /* ---------- 合并 ---------- */
    function updateActions() {
        var n = state.files.length;
        var totalPages = state.files.reduce(function (s, f) { return s + (f.info && f.info.pages ? f.info.pages : 0); }, 0);
        el.mergeBtn.disabled = n === 0 || state.uploading;
        var label = $('mergeBtnText');
        if (label) {
            label.textContent = n === 0
                ? '合并 PDF'
                : '合并 PDF（' + n + ' 个文件 · ' + totalPages + ' 页）';
        }
    }

    async function mergePDFs() {
        if (state.files.length === 0) {
            toast({ message: '请先上传 PDF 文件', type: 'warn' });
            return;
        }

        var d = new Date();
        var pad = function (x) { return (x < 10 ? '0' : '') + x; };
        var defaultName = 'merged_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
        var totalPages = state.files.reduce(function (s, f) { return s + (f.info && f.info.pages ? f.info.pages : 0); }, 0);

        var name = await promptMergeName(defaultName, '将按当前顺序合并 ' + state.files.length + ' 个文件，共 ' + totalPages + ' 页');
        if (!name) return;

        el.loadingOverlay.classList.remove('hidden');
        try {
            var resp = await fetch('/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_ids: state.files.map(function (f) { return f.id; }),
                    filename: name + '.pdf'
                })
            });
            var data = await resp.json();
            if (!data.success) throw new Error(data.error || '未知错误');

            // 合并后服务端已清理上传文件，前端同步重置
            state.files.forEach(function (f) {
                var u = state.thumbCache.get(f.id);
                if (u && u !== 'fallback') { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }
            });
            state.thumbCache.clear();
            state.files = [];
            renderFileList();
            renderPreviewEmpty();
            updateSummary(0);
            updateActions();

            $('pmSuccessFile').textContent = data.merged_file || (name + '.pdf');
            el.downloadLink.href = data.download_url || '#';
            openModal(el.successModal);
            toast({ message: '合并完成，可以下载了', type: 'success' });
        } catch (err) {
            toast({ message: '合并失败：' + err.message, type: 'error', duration: 4500 });
        } finally {
            el.loadingOverlay.classList.add('hidden');
        }
    }

    /* ---------- 初始化 ---------- */
    function resolveElements() {
        el.uploadArea = $('uploadArea');
        el.fileInput = $('fileInput');
        el.browseBtn = $('browseBtn');
        el.uploadProgress = $('uploadProgress');
        el.progressFill = $('progressFill');
        el.progressText = $('progressText');
        el.fileList = $('fileList');
        el.mergeBtn = $('mergeBtn');
        el.clearBtn = $('clearBtn');
        el.previewContainer = $('previewContainer');
        el.previewPageCount = $('previewPageCount');
        el.previewSummary = $('previewSummary');
        el.loadingOverlay = $('loadingOverlay');
        el.successModal = $('successModal');
        el.downloadLink = $('downloadLink');
        el.closeModalBtn = $('closeModal');
        return !!(el.fileList && el.uploadArea && el.mergeBtn);
    }

    // 路由切换时本脚本可能被"晚到"执行（上一次注入的请求返回时页面已经换掉了），
    // 此时按 id 找不到本页元素，直接 return 会让合并页没有任何拖拽响应。
    // 因此有限次重试，直到自己那一份 DOM 出现为止。
    function init(attempt) {
        ensureStyles();
        if (!resolveElements()) {
            if ((attempt || 0) < 20) setTimeout(function () { init((attempt || 0) + 1); }, 100);
            return;
        }

        setupUploadArea();
        setupGlobalDragDrop();

        el.mergeBtn.addEventListener('click', mergePDFs);
        el.clearBtn.addEventListener('click', clearAllFiles);
        el.closeModalBtn.addEventListener('click', function () { closeModal(el.successModal); });
        el.successModal.addEventListener('click', function (e) {
            if (e.target === el.successModal) closeModal(el.successModal);
        });

        renderFileList();
        renderPreviewEmpty();
        updateSummary(0);
        updateActions();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
