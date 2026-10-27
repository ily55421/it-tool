// 应用中心 —— 全页面图标启动器 + 顶栏面包屑
// 数据来源全部在 tools-registry.js，新增工具不需要改这里的渲染逻辑。

const appCenterComponent = `
<div class="ac-page">
    <div class="ac-hero">
        <h1 class="ac-title">应用中心</h1>
        <p class="ac-sub">共 <span id="acTotal">0</span> 个工具，全部在本机运行，文件不会离开这台电脑</p>
        <div class="ac-search">
            <span class="ac-search-icon" id="acSearchIcon"></span>
            <input type="search" id="acSearch" placeholder="搜索工具，例如「二维码」「合并」「哈希」" autocomplete="off" spellcheck="false" aria-label="搜索工具">
            <button type="button" class="ac-search-clear" id="acClear" hidden aria-label="清空搜索"></button>
        </div>
        <div class="ac-chips" id="acChips" role="tablist"></div>
        <p class="ac-hint">Ctrl K 唤起搜索 · 方向键选择 · Enter 打开 · Esc 清空</p>
    </div>
    <div class="ac-body" id="acGroups"></div>
    <p class="ac-empty" id="acEmpty" hidden>没有匹配的工具，换个关键词试试</p>
</div>
`;

(function (global) {
    const T = window.ITToolset;
    const state = { query: '', cat: null };
    const RECENT_MAX = 8;
    // 分类 chip 属于页面内切换，保留搜索词；从别的页面进入则视为一次全新打开。
    let keepQuery = false;

    // 偏好存在本地服务而不是 localStorage：WebView2 的存储按源隔离，
    // 而本服务端口每次启动都不同，客户端存储跨重启一定会丢。
    const settings = { data: {}, loaded: false };

    function loadSettings() {
        return fetch('/api/settings')
            .then(function (response) { return response.ok ? response.json() : {}; })
            .then(function (data) {
                settings.data = data && typeof data === 'object' ? data : {};
            })
            .catch(function () { /* 拿不到就用空默认值，不影响主流程 */ })
            .then(function () {
                settings.loaded = true;
                // 首屏可能已经渲染过一次（那时还没有数据），补一次重绘
                if (document.getElementById('acGroups')) refresh();
            });
    }

    function recentRoutes() {
        const list = settings.data.recent;
        if (!Array.isArray(list)) return [];
        return list.map(function (route) { return T.toolByRoute(route); }).filter(Boolean);
    }

    function rememberRecent(route) {
        const current = Array.isArray(settings.data.recent) ? settings.data.recent : [];
        const next = [route].concat(current.filter(function (r) { return r !== route; })).slice(0, RECENT_MAX);
        settings.data.recent = next; // 乐观更新，本会话立即可见
        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recent: next })
        }).catch(function () { /* 写失败只影响下次启动的记忆 */ });
    }

    function categoryFromHash() {
        const hash = window.location.hash.slice(1);
        const mark = hash.indexOf('?');
        if (mark < 0) return null;
        const id = new URLSearchParams(hash.slice(mark + 1)).get('cat');
        return T.categoryById(id) ? id : null;
    }

    function matchScore(tool, tokens) {
        const hay = (tool.name + ' ' + tool.desc + ' ' + tool.tags + ' '
            + (T.categoryById(tool.cat) || { name: '' }).name).toLowerCase();
        return tokens.every(function (token) { return hay.indexOf(token) >= 0; });
    }

    function visibleTools() {
        const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return T.TOOLS.filter(function (tool) {
            if (state.cat && tool.cat !== state.cat) return false;
            return tokens.length === 0 || matchScore(tool, tokens);
        });
    }

    function tileMarkup(tool) {
        const cat = T.categoryById(tool.cat);
        return '<a class="ac-tile" href="#' + tool.route + '" style="--ac-a:' + cat.a + ';--ac-b:' + cat.b + '">'
            + '<span class="ac-tile-icon">' + T.toolIcon(tool) + '</span>'
            + '<span class="ac-tile-name">' + tool.name + '</span>'
            + '<span class="ac-tile-desc">' + tool.desc + '</span>'
            + '</a>';
    }

    function groupMarkup(cat, tools) {
        return '<section class="ac-group" style="--ac-a:' + cat.a + ';--ac-b:' + cat.b + '">'
            + '<header class="ac-group-head">'
            + '<span class="ac-group-icon">' + T.categoryIcon(cat) + '</span>'
            + '<h2 class="ac-group-title">' + cat.name + '</h2>'
            + '<span class="ac-group-count">' + tools.length + '</span>'
            + '</header>'
            + '<div class="ac-grid">' + tools.map(tileMarkup).join('') + '</div>'
            + '</section>';
    }

    function renderChips() {
        const chips = T.CATEGORIES.map(function (cat) {
            const active = state.cat === cat.id;
            return '<button type="button" class="ac-chip' + (active ? ' active' : '')
                + '" data-cat="' + cat.id + '" style="--ac-a:' + cat.a + ';--ac-b:' + cat.b + '">'
                + T.categoryIcon(cat) + cat.name + '</button>';
        }).join('');
        document.getElementById('acChips').innerHTML =
            '<button type="button" class="ac-chip ac-chip-all' + (state.cat ? '' : ' active')
            + '" data-cat="">全部</button>' + chips;
    }

    function recentGroup() {
        const tools = recentRoutes();
        if (!tools.length) return '';
        return '<section class="ac-group ac-group-recent" style="--ac-a:#2f7fe8;--ac-b:#1850d2">'
            + '<header class="ac-group-head">'
            + '<span class="ac-group-icon">' + T.svg(T.UI_ICONS.grid) + '</span>'
            + '<h2 class="ac-group-title">最近使用</h2>'
            + '<span class="ac-group-count">' + tools.length + '</span>'
            + '</header>'
            + '<div class="ac-grid">' + tools.map(tileMarkup).join('') + '</div>'
            + '</section>';
    }

    function renderGroups() {
        const tools = visibleTools();
        const body = document.getElementById('acGroups');
        if (state.cat) {
            const cat = T.categoryById(state.cat);
            body.innerHTML = tools.length ? groupMarkup(cat, tools) : '';
        } else {
            const recent = state.query.trim() ? '' : recentGroup();
            body.innerHTML = recent + T.CATEGORIES.map(function (cat) {
                const grouped = tools.filter(function (t) { return t.cat === cat.id; });
                return grouped.length ? groupMarkup(cat, grouped) : '';
            }).join('');
        }
        document.getElementById('acEmpty').hidden = tools.length > 0;
    }

    function refresh() {
        renderGroups();
        const clear = document.getElementById('acClear');
        if (clear) clear.hidden = state.query.length === 0;
    }

    function openCategory(catId) {
        keepQuery = true;
        const target = catId ? '#/apps?cat=' + catId : '#/apps';
        if (window.location.hash === target) {
            state.cat = catId || null;
            renderChips();
            refresh();
        } else {
            window.location.hash = target;
        }
    }

    function mount() {
        state.cat = categoryFromHash();
        if (!keepQuery) state.query = '';
        keepQuery = false;

        document.getElementById('acTotal').textContent = String(T.TOOLS.length);
        document.getElementById('acSearchIcon').innerHTML = T.svg(T.UI_ICONS.search);
        document.getElementById('acClear').innerHTML = T.svg(T.UI_ICONS.close);

        const input = document.getElementById('acSearch');
        input.value = state.query;
        input.focus({ preventScroll: true });

        renderChips();
        refresh();
    }

    function focusSearch() {
        const input = document.getElementById('acSearch');
        if (!input) {
            keepQuery = false;
            window.location.hash = '#/apps';
            return;
        }
        input.focus();
        input.select();
    }

    // 方向键在图标之间移动焦点：图标墙用 <a> 渲染，回车天然就是打开
    function moveFocus(step) {
        const tiles = Array.prototype.slice.call(document.querySelectorAll('#acGroups .ac-tile'));
        if (!tiles.length) return;
        const active = document.activeElement;
        let index = tiles.indexOf(active);
        if (index < 0) {
            index = step > 0 ? 0 : tiles.length - 1;
        } else {
            index = Math.min(tiles.length - 1, Math.max(0, index + step));
        }
        tiles[index].focus();
        tiles[index].scrollIntoView({ block: 'nearest' });
    }

    function wire() {
        const input = document.getElementById('acSearch');
        if (!input) return;

        input.addEventListener('input', function () {
            state.query = input.value;
            refresh();
        });
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                state.query = '';
                input.value = '';
                refresh();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveFocus(1);
                return;
            }
            if (event.key === 'Enter') {
                const first = document.querySelector('#acGroups .ac-tile');
                if (first) window.location.hash = first.getAttribute('href').slice(1);
            }
        });
        document.getElementById('acClear').addEventListener('click', function () {
            state.query = '';
            input.value = '';
            input.focus();
            refresh();
        });
        document.getElementById('acChips').addEventListener('click', function (event) {
            const chip = event.target.closest('.ac-chip');
            if (chip) openCategory(chip.getAttribute('data-cat'));
        });
    }

    // ---------- 非阻塞提示 ----------
    // 各工具页里有 70 多处 alert()，在桌面壳里会弹原生对话框并冻结渲染进程
    // （CDP 自动化也会被卡死），所以统一改写成页面内的 toast。
    function toastTone(text) {
        if (/(失败|错误|异常|不能|无法|请[先输上选]|缺少|不支持)/.test(text)) return 'error';
        if (/(成功|已完成|已复制|已保存)/.test(text)) return 'success';
        return 'info';
    }

    function showAppToast(message) {
        const text = String(message === undefined || message === null ? '' : message).trim();
        if (!text) return;
        let wrap = document.getElementById('appToastWrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'appToastWrap';
            wrap.className = 'app-toast-wrap';
            wrap.setAttribute('aria-live', 'polite');
            document.body.appendChild(wrap);
        }
        const item = document.createElement('div');
        item.className = 'app-toast ' + toastTone(text);
        item.textContent = stripLeadingEmoji(text);
        wrap.appendChild(item);
        setTimeout(function () {
            item.classList.add('out');
            setTimeout(function () { item.remove(); }, 280);
        }, 2800);
    }

    global.showAppToast = showAppToast;
    window.alert = showAppToast;

    // ---------- 页面标题与文案统一 ----------

    // 只吃开头的 emoji（含变体选择符/零宽连接符/#键帽），"← 返回"、"1. 上传" 这类不动。
    const LEADING_EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D\s]+/u;

    function stripLeadingEmoji(text) {
        const match = text.match(LEADING_EMOJI);
        if (!match || !/[\p{Extended_Pictographic}\uFE0F]/u.test(match[0])) return text;
        const rest = text.slice(match[0].length).trim();
        return rest.length ? rest : text;
    }

    // 只改首个文本节点，避免抹掉按钮内部的状态 span。
    function polishTextNodes(selector) {
        document.querySelectorAll('#app ' + selector).forEach(function (node) {
            const first = node.firstChild;
            if (!first || first.nodeType !== 3) return;
            const cleaned = stripLeadingEmoji(first.nodeValue);
            if (cleaned !== first.nodeValue) first.nodeValue = cleaned;
        });
    }

    // 各页标题层级不统一：it-tools 用 h1，图片工具与 JSON 格式化用 header 里的 h2，
    // 差异对比 / JSON 可视化的标题在工具栏里。统一按注册表名称 + 徽标重写。
    const PAGE_TITLE_SELECTOR = [
        '#app h1',
        '#app .diff-toolbar-title',
        '#app .jv-toolbar-title',
        '#app .image-processor-header h2',
        '#app .format-header h2',
        '#app .exif-header h2',
        '#app .idphoto-header h2',
        '#app .qrcode-header h2',
        '#app .gif-header h2',
        '#app .pdf-header h2',
        '#app .json-formatter-header h2'
    ].join(', ');

    function polishPage(tool) {
        if (tool) {
            const heading = document.querySelector(PAGE_TITLE_SELECTOR);
            if (heading) {
                const cat = T.categoryById(tool.cat);
                heading.classList.add('page-head');
                heading.innerHTML = '<span class="page-head-icon" style="--ac-a:' + cat.a + ';--ac-b:' + cat.b + '">'
                    + T.toolIcon(tool) + '</span><span class="page-head-text">' + tool.name + '</span>';
            }
        }
        polishTextNodes('h2, h3, .card-title, .panel-title, button, .back-btn');
    }

    // ---------- 顶栏 ----------

    function isCenterPath(path) {
        return path === '/apps' || path === '/';
    }

    function categoryChip(category) {
        return '<span class="app-bar-cat" style="--ac-a:' + category.a + ';--ac-b:' + category.b + '">'
            + T.categoryIcon(category) + category.name + '</span>';
    }

    function onRoute(path) {
        const tool = T.toolByRoute(path);
        const center = isCenterPath(path);
        const crumb = document.getElementById('appBarCrumb');
        const back = document.getElementById('appBarBack');
        const home = document.getElementById('appBarHome');

        if (crumb) {
            const parts = [];
            if (tool) {
                parts.push(categoryChip(T.categoryById(tool.cat)));
                parts.push('<span class="app-bar-tool">' + tool.name + '</span>');
            } else {
                parts.push('<span class="app-bar-tool">应用中心</span>');
                const activeCat = center ? T.categoryById(state.cat) : null;
                if (activeCat) parts.push(categoryChip(activeCat));
            }
            crumb.innerHTML = parts.join('<span class="app-bar-sep">/</span>');
        }
        if (back) back.hidden = center;
        if (home) home.classList.toggle('active', center);
        document.title = tool ? 'IT-Tools · ' + tool.name : 'IT-Tools 工具箱';
        if (tool) rememberRecent(tool.route);
        polishPage(tool);
    }

    function wireBar() {
        const back = document.getElementById('appBarBack');
        if (back) {
            back.innerHTML = T.svg(T.UI_ICONS.back);
            back.addEventListener('click', function () { window.history.back(); });
        }
        const home = document.getElementById('appBarHome');
        if (home) home.innerHTML = T.svg(T.UI_ICONS.grid) + '<span>应用中心</span>';

        // 全局快捷键：启动器要能纯键盘用
        document.addEventListener('keydown', function (event) {
            const tag = (document.activeElement || {}).tagName || '';
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                focusSearch();
                return;
            }
            if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                focusSearch();
                return;
            }
            if (event.key === 'Escape' && !typing && !isCenterPath(currentPath())) {
                window.location.hash = '#/apps';
                return;
            }
            if (!typing && event.target.closest && event.target.closest('#acGroups .ac-tile')) {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                if (step) {
                    event.preventDefault();
                    moveFocus(step);
                }
            }
        });
    }

    function currentPath() {
        return window.location.hash.slice(1).split('?')[0] || '/';
    }

    global.AppCenter = {
        mount: function () { mount(); wire(); },
        focusSearch: focusSearch,
        onRoute: onRoute
    };

    // 本脚本是 defer 的，执行时 DOM 已解析完，直接初始化即可；
    // 偏好要尽早开始拉取，首屏的「最近使用」才不会闪空。
    wireBar();
    loadSettings();
})(window);
