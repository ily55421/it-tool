var jsonVisionComponent = `
<div class="jv-container" id="jvContainer">
    <div class="jv-toolbar">
        <span class="jv-toolbar-title">📊 JSON Vision 可视化画布</span>
        <button class="jv-toolbar-btn" onclick="jvClearAll()">🗑️ 清空</button>
        <button class="jv-toolbar-btn" onclick="jvLoadSample()">📝 示例</button>
        <button class="jv-toolbar-btn" onclick="jvUploadFile()">📁 打开文件</button>
        <button class="jv-toolbar-btn" onclick="jvFormatJson()">✨ 格式化</button>
        <button class="jv-toolbar-btn" onclick="jvValidateJson()">✅ 校验</button>
        <div class="jv-toolbar-separator"></div>
        <button class="jv-toolbar-btn" id="jvAutoLayout" onclick="jvToggleAutoLayout()">🔄 自动布局</button>
        <button class="jv-toolbar-btn" id="jvCollapsed" onclick="jvToggleCollapse()">📂 折叠全部</button>
        <div class="jv-toolbar-separator"></div>
        <div class="jv-search-box">
            <input type="text" id="jvSearchInput" placeholder="搜索 Key 或 Value..." oninput="jvDebounceSearch()">
            <button class="jv-search-btn" onclick="jvSearch()">🔍</button>
        </div>
        <div class="jv-toolbar-separator"></div>
        <button class="jv-toolbar-btn" onclick="jvZoomIn()">➕ 放大</button>
        <button class="jv-toolbar-btn" onclick="jvZoomOut()">➖ 缩小</button>
        <button class="jv-toolbar-btn" onclick="jvZoomReset()">🔃 重置</button>
        <button class="jv-toolbar-btn" onclick="jvExportPng()">📷 导出PNG</button>
        <button class="jv-toolbar-btn" onclick="jvExportJson()">💾 导出JSON</button>
        <input type="file" id="jvFileInput" class="jv-file-input" accept=".json,.txt" onchange="jvHandleFile(event)">
    </div>
    <div class="jv-main-area">
        <div class="jv-editor-panel" id="jvEditorPanel">
            <div class="jv-panel-header">
                <span>JSON Editor</span>
                <span class="jv-validation-status" id="jvValidationStatus"></span>
            </div>
            <textarea class="jv-editor" id="jvEditor" placeholder="粘贴或输入 JSON 数据..." oninput="jvDebounceParse()"></textarea>
        </div>
        <div class="jv-canvas-panel" id="jvCanvasPanel">
            <div class="jv-canvas-header">
                <span>可视化画布</span>
                <div class="jv-canvas-info" id="jvCanvasInfo">等待输入...</div>
            </div>
            <div class="jv-canvas-container" id="jvCanvasContainer">
                <div class="jv-canvas" id="jvCanvas"></div>
            </div>
        </div>
    </div>
    <div class="jv-status-bar" id="jvStatusBar">
        <span id="jvStatInfo">就绪</span>
    </div>
</div>
`;

var jvState = {
    json: null,
    nodes: [],
    edges: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    isPanning: false,
    dragNode: null,
    lastX: 0,
    lastY: 0,
    searchTimer: null,
    searchMatches: [],
    currentMatch: 0,
    collapsedNodes: new Set(),
    autoLayout: true,
    nodePositions: {},
    nodeId: 0,
};

function jvGenerateId() {
    return 'jv_node_' + (++jvState.nodeId);
}

function jvDebounceParse() {
    clearTimeout(jvState.parseTimer);
    jvState.parseTimer = setTimeout(jvParse, 300);
}

function jvDebounceSearch() {
    clearTimeout(jvState.searchTimer);
    jvState.searchTimer = setTimeout(jvSearch, 300);
}

function jvParse() {
    const editor = document.getElementById('jvEditor');
    const text = editor.value.trim();
    const status = document.getElementById('jvValidationStatus');
    const canvasInfo = document.getElementById('jvCanvasInfo');
    const statInfo = document.getElementById('jvStatInfo');

    if (!text) {
        jvState.json = null;
        jvState.nodes = [];
        jvState.edges = [];
        status.textContent = '';
        status.className = 'jv-validation-status';
        canvasInfo.textContent = '等待输入...';
        statInfo.textContent = '就绪';
        jvRenderCanvas();
        return;
    }

    try {
        jvState.json = JSON.parse(text);
        status.textContent = '✅ 有效 JSON';
        status.className = 'jv-validation-status valid';
        jvState.nodeId = 0;
        jvState.nodes = [];
        jvState.edges = [];
        jvState.nodePositions = {};
        jvState.collapsedNodes.clear();

        jvBuildGraph(jvState.json, 'root', null, 0);

        const nodeCount = jvState.nodes.length;
        const edgeCount = jvState.edges.length;
        canvasInfo.textContent = `节点: ${nodeCount} | 边: ${edgeCount}`;
        statInfo.textContent = `解析成功: ${nodeCount} 节点, ${edgeCount} 边`;

        if (jvState.autoLayout) {
            jvAutoArrange();
        }

        jvRenderCanvas();
    } catch (e) {
        jvState.json = null;
        status.textContent = '❌ ' + e.message.substring(0, 30);
        status.className = 'jv-validation-status invalid';
        canvasInfo.textContent = 'JSON 解析错误';
        statInfo.textContent = '解析失败';
        jvState.nodes = [];
        jvState.edges = [];
        jvRenderCanvas();
    }
}

function jvBuildGraph(obj, key, parentId, depth, arrayIndex = null) {
    if (depth > 50) return;

    const nodeId = jvGenerateId();
    const type = jvGetType(obj);
    let label = key;
    if (arrayIndex !== null) {
        label = `[${arrayIndex}]`;
    }
    let value = '';
    if (type === 'string') value = obj.length > 50 ? obj.substring(0, 50) + '...' : obj;
    else if (type === 'number' || type === 'boolean') value = String(obj);
    else if (type === 'null') value = 'null';

    const node = {
        id: nodeId,
        type: type,
        key: key,
        label: label,
        value: value,
        depth: depth,
        parentId: parentId,
        children: [],
        collapsed: false,
        x: 0,
        y: 0,
        width: 180,
        height: type === 'object' || type === 'array' ? 40 : 60
    };

    jvState.nodes.push(node);

    if (parentId) {
        jvState.edges.push({
            id: 'edge_' + nodeId,
            source: parentId,
            target: nodeId,
            label: key
        });
    }

    if (type === 'object' && obj !== null) {
        Object.keys(obj).forEach(k => {
            node.children.push(jvBuildGraph(obj[k], k, nodeId, depth + 1));
        });
    } else if (type === 'array') {
        obj.forEach((item, idx) => {
            node.children.push(jvBuildGraph(item, `[${idx}]`, nodeId, depth + 1, idx));
        });
    }

    return nodeId;
}

function jvGetType(obj) {
    if (obj === null) return 'null';
    if (Array.isArray(obj)) return 'array';
    return typeof obj;
}

function jvAutoArrange() {
    const rootNodes = jvState.nodes.filter(n => n.parentId === null);
    if (rootNodes.length === 0) return;

    let yOffset = 50;
    for (const root of rootNodes) {
        jvLayoutNode(root, 50, yOffset);
        yOffset += jvMeasureSubtree(root) * 80 + 50;
    }
}

function jvLayoutNode(node, x, y) {
    node.x = x;
    node.y = y;
    jvState.nodePositions[node.id] = { x, y };

    if (node.children.length === 0) return;

    const totalSubtreeHeight = jvMeasureSubtree(node);
    let startY = y - (totalSubtreeHeight * 35);

    for (const childId of node.children) {
        const child = jvState.nodes.find(n => n.id === childId);
        if (child) {
            const childSubtreeHeight = jvMeasureSubtree(child);
            const childY = startY + childSubtreeHeight * 35;
            jvLayoutNode(child, x + 220, childY);
            startY += childSubtreeHeight * 70;
        }
    }
}

function jvMeasureSubtree(node) {
    if (node.children.length === 0) return 1;
    let count = 0;
    for (const childId of node.children) {
        const child = jvState.nodes.find(n => n.id === childId);
        if (child) count += jvMeasureSubtree(child);
    }
    return Math.max(count, 1);
}

function jvGetHiddenNodes() {
    const hidden = new Set();
    
    function hideDescendants(nodeId) {
        const node = jvState.nodes.find(n => n.id === nodeId);
        if (!node) return;
        for (const childId of node.children) {
            hidden.add(childId);
            hideDescendants(childId);
        }
    }
    
    for (const node of jvState.nodes) {
        if (node.collapsed && node.children.length > 0) {
            hideDescendants(node.id);
        }
    }
    
    return hidden;
}

function jvRenderCanvas() {
    const canvas = document.getElementById('jvCanvas');
    if (!canvas) return;

    const hiddenNodes = jvGetHiddenNodes();

    let html = `<div class="jv-graph" id="jvGraph" style="transform: translate(${jvState.panX}px, ${jvState.panY}px) scale(${jvState.zoom}); transform-origin: 0 0;">`;

    for (const edge of jvState.edges) {
        if (hiddenNodes.has(edge.source) || hiddenNodes.has(edge.target)) continue;
        const source = jvState.nodes.find(n => n.id === edge.source);
        const target = jvState.nodes.find(n => n.id === edge.target);
        if (source && target) {
            html += jvRenderEdge(edge, source, target);
        }
    }

    for (const node of jvState.nodes) {
        if (hiddenNodes.has(node.id)) continue;
        html += jvRenderNode(node);
    }

    html += '</div>';
    canvas.innerHTML = html;

    jvBindNodeEvents();
}

function jvRenderNode(node) {
    const isCollapsed = node.collapsed;
    const childCount = node.children.length;
    const hasChildren = childCount > 0;

    let typeClass = 'jv-node-' + node.type;
    if (isCollapsed && hasChildren) typeClass += ' collapsed';

    let valueDisplay = '';
    if (node.type === 'object') {
        valueDisplay = isCollapsed ? `{ ${childCount} keys }` : `{ ... }`;
    } else if (node.type === 'array') {
        valueDisplay = isCollapsed ? `[ ${childCount} items ]` : '[ ... ]';
    } else if (node.type === 'string') {
        valueDisplay = `"${node.value}"`;
    } else if (node.type === 'number') {
        valueDisplay = node.value;
    } else if (node.type === 'boolean') {
        valueDisplay = node.value;
    } else if (node.type === 'null') {
        valueDisplay = 'null';
    }

    let expandIcon = '';
    if (hasChildren) {
        expandIcon = isCollapsed ?
            `<span class="jv-expand-icon" onclick="event.stopPropagation(); jvToggleNode('${node.id}')">▶</span>` :
            `<span class="jv-expand-icon" onclick="event.stopPropagation(); jvToggleNode('${node.id}')">▼</span>`;
    }

    return `
        <div class="jv-node ${typeClass}"
             id="${node.id}"
             data-key="${jvEscapeHtml(node.key)}"
             data-value="${jvEscapeHtml(String(node.value))}"
             style="left: ${node.x}px; top: ${node.y}px;">
            <div class="jv-node-header">
                ${expandIcon}
                <span class="jv-node-key">${jvEscapeHtml(node.label)}</span>
                <span class="jv-node-type">${node.type}</span>
            </div>
            <div class="jv-node-value">${jvEscapeHtml(valueDisplay)}</div>
        </div>
    `;
}

function jvRenderEdge(edge, source, target) {
    const sx = source.x + 180;
    const sy = source.y + (source.type === 'object' || source.type === 'array' ? 20 : 30);
    const tx = target.x;
    const ty = target.y + (target.type === 'object' || target.type === 'array' ? 20 : 30);

    const midX = (sx + tx) / 2;

    return `<svg class="jv-edge" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;">
        <path d="M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}"
              stroke="#b9c8d8" stroke-width="1.5" fill="none"/>
    </svg>`;
}

function jvEscapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function jvBindNodeEvents() {
    const container = document.getElementById('jvCanvasContainer');
    if (!container) return;

    container.onmousedown = jvCanvasMouseDown;
    container.onmousemove = jvCanvasMouseMove;
    container.onmouseup = jvCanvasMouseUp;
    container.onmouseleave = jvCanvasMouseUp;
    container.onwheel = jvCanvasWheel;
    container.onselectstart = () => false;
    container.oncontextmenu = (e) => e.preventDefault();

    document.querySelectorAll('.jv-node').forEach(nodeEl => {
        nodeEl.onmousedown = jvNodeMouseDown;
        nodeEl.onclick = jvNodeClick;
    });
}

function jvUpdateCanvasTransform() {
    const graph = document.getElementById('jvGraph');
    if (graph) {
        graph.style.transform = `translate(${jvState.panX}px, ${jvState.panY}px) scale(${jvState.zoom})`;
    }
}

function jvCanvasMouseDown(e) {
    if (e.target.classList.contains('jv-node') || e.target.closest('.jv-node')) return;
    e.preventDefault();
    jvState.isPanning = true;
    jvState.lastX = e.clientX;
    jvState.lastY = e.clientY;
    document.getElementById('jvCanvasContainer').style.cursor = 'grabbing';
}

function jvCanvasMouseMove(e) {
    if (jvState.isPanning) {
        e.preventDefault();
        const dx = e.clientX - jvState.lastX;
        const dy = e.clientY - jvState.lastY;
        jvState.panX += dx;
        jvState.panY += dy;
        jvState.lastX = e.clientX;
        jvState.lastY = e.clientY;
        jvUpdateCanvasTransform();
    } else if (jvState.isDragging && jvState.dragNode) {
        e.preventDefault();
        const dx = (e.clientX - jvState.lastX) / jvState.zoom;
        const dy = (e.clientY - jvState.lastY) / jvState.zoom;
        jvState.dragNode.x += dx;
        jvState.dragNode.y += dy;
        jvState.lastX = e.clientX;
        jvState.lastY = e.clientY;
        jvRenderCanvas();
    }
}

function jvCanvasMouseUp() {
    jvState.isPanning = false;
    jvState.isDragging = false;
    jvState.dragNode = null;
    const container = document.getElementById('jvCanvasContainer');
    if (container) container.style.cursor = 'grab';
}

function jvCanvasWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    jvState.zoom = Math.max(0.1, Math.min(3, jvState.zoom + delta));
    jvRenderCanvas();
}

function jvNodeMouseDown(e) {
    e.stopPropagation();
    const nodeId = e.currentTarget.id;
    const node = jvState.nodes.find(n => n.id === nodeId);
    if (node) {
        jvState.isDragging = true;
        jvState.dragNode = node;
        jvState.lastX = e.clientX;
        jvState.lastY = e.clientY;
    }
}

function jvNodeClick(e) {
    e.stopPropagation();
    const nodeId = e.currentTarget.id;
    const node = jvState.nodes.find(n => n.id === nodeId);
    if (node) {
        document.querySelectorAll('.jv-node').forEach(el => el.classList.remove('selected'));
        document.getElementById(nodeId).classList.add('selected');
        jvHighlightPath(nodeId);
    }
}

function jvToggleNode(nodeId) {
    const node = jvState.nodes.find(n => n.id === nodeId);
    if (!node) return;

    node.collapsed = !node.collapsed;

    if (node.collapsed) {
        jvState.collapsedNodes.add(nodeId);
    } else {
        jvState.collapsedNodes.delete(nodeId);
    }

    if (jvState.autoLayout) {
        jvAutoArrange();
    }

    jvRenderCanvas();
}

function jvHighlightPath(nodeId) {
    document.querySelectorAll('.jv-node').forEach(el => el.classList.remove('path-highlight'));
    document.querySelectorAll('.jv-edge').forEach(el => el.classList.remove('path-highlight'));

    let current = jvState.nodes.find(n => n.id === nodeId);
    while (current) {
        const el = document.getElementById(current.id);
        if (el) el.classList.add('path-highlight');

        const edge = jvState.edges.find(e => e.target === current.id);
        if (edge) {
            const edgeEl = document.getElementById(edge.id);
            if (edgeEl) edgeEl.classList.add('path-highlight');
        }

        current = jvState.nodes.find(n => n.id === current.parentId);
    }
}

function jvClearHighlights() {
    document.querySelectorAll('.jv-node').forEach(el => el.classList.remove('path-highlight', 'search-highlight'));
    document.querySelectorAll('.jv-edge').forEach(el => el.classList.remove('path-highlight', 'search-highlight'));
}

function jvSearch() {
    const query = document.getElementById('jvSearchInput').value.trim().toLowerCase();
    if (!query) {
        jvClearHighlights();
        jvState.searchMatches = [];
        return;
    }

    jvClearHighlights();
    jvState.searchMatches = [];
    jvState.currentMatch = 0;

    for (const node of jvState.nodes) {
        const keyMatch = node.key.toLowerCase().includes(query);
        const valueMatch = String(node.value).toLowerCase().includes(query);
        if (keyMatch || valueMatch) {
            jvState.searchMatches.push(node.id);
            const el = document.getElementById(node.id);
            if (el) {
                el.classList.add('search-highlight');
                if (keyMatch) el.dataset.matchType = 'key';
                else if (valueMatch) el.dataset.matchType = 'value';
            }
        }
    }

    const statInfo = document.getElementById('jvStatInfo');
    statInfo.textContent = `找到 ${jvState.searchMatches.length} 个匹配`;

    if (jvState.searchMatches.length > 0) {
        jvScrollToNode(jvState.searchMatches[0]);
    }
}

function jvScrollToNode(nodeId) {
    const node = jvState.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const container = document.getElementById('jvCanvasContainer');
    const canvas = document.getElementById('jvCanvas');

    const centerX = node.x + 90;
    const centerY = node.y + 30;

    jvState.panX = container.clientWidth / 2 - centerX * jvState.zoom;
    jvState.panY = container.clientHeight / 2 - centerY * jvState.zoom;

    jvRenderCanvas();

    const el = document.getElementById(nodeId);
    if (el) el.classList.add('selected');
}

function jvZoomIn() {
    jvState.zoom = Math.min(3, jvState.zoom + 0.2);
    jvRenderCanvas();
}

function jvZoomOut() {
    jvState.zoom = Math.max(0.1, jvState.zoom - 0.2);
    jvRenderCanvas();
}

function jvZoomReset() {
    jvState.zoom = 1;
    jvState.panX = 0;
    jvState.panY = 0;
    jvRenderCanvas();
}

function jvToggleAutoLayout() {
    jvState.autoLayout = !jvState.autoLayout;
    const btn = document.getElementById('jvAutoLayout');
    if (btn) btn.classList.toggle('active', jvState.autoLayout);

    if (jvState.autoLayout) {
        jvAutoArrange();
        jvRenderCanvas();
    }
}

function jvToggleCollapse() {
    const allExpanded = jvState.nodes.some(n => n.collapsed);
    const btn = document.getElementById('jvCollapsed');

    if (allExpanded) {
        jvState.nodes.forEach(n => n.collapsed = false);
        jvState.collapsedNodes.clear();
        if (btn) btn.textContent = '📂 折叠全部';
    } else {
        jvState.nodes.forEach(n => {
            if (n.children.length > 0) {
                n.collapsed = true;
                jvState.collapsedNodes.add(n.id);
            }
        });
        if (btn) btn.textContent = '📂 展开全部';
    }

    if (jvState.autoLayout) {
        jvAutoArrange();
    }
    jvRenderCanvas();
}

function jvClearAll() {
    document.getElementById('jvEditor').value = '';
    jvState.json = null;
    jvState.nodes = [];
    jvState.edges = [];
    jvState.nodePositions = {};
    jvState.collapsedNodes.clear();
    jvState.searchMatches = [];
    jvState.zoom = 1;
    jvState.panX = 0;
    jvState.panY = 0;
    jvState.nodeId = 0;
    document.getElementById('jvValidationStatus').textContent = '';
    document.getElementById('jvCanvasInfo').textContent = '等待输入...';
    document.getElementById('jvStatInfo').textContent = '就绪';
    jvRenderCanvas();
}

function jvLoadSample() {
    const sample = {
        "name": "JSON Vision",
        "version": "1.0.0",
        "description": "JSON 可视化画布系统",
        "features": [
            "实时解析",
            "图谱可视化",
            "无限画布",
            "搜索高亮"
        ],
        "author": {
            "name": "Developer",
            "email": "dev@example.com",
            "skills": ["JavaScript", "Python", "Vue.js"]
        },
        "stats": {
            "users": 10000,
            "rating": 4.8,
            "downloads": 50000
        },
        "isPublic": true,
        "tags": ["visualization", "json", "developer-tools"],
        "config": {
            "theme": "dark",
            "language": "zh-CN",
            "autoSave": true
        }
    };

    document.getElementById('jvEditor').value = JSON.stringify(sample, null, 2);
    jvParse();
}

function jvFormatJson() {
    const editor = document.getElementById('jvEditor');
    try {
        const parsed = JSON.parse(editor.value);
        editor.value = JSON.stringify(parsed, null, 2);
        jvParse();
    } catch (e) {
        alert('JSON 格式错误: ' + e.message);
    }
}

function jvValidateJson() {
    const editor = document.getElementById('jvEditor');
    try {
        JSON.parse(editor.value);
        alert('✅ JSON 格式正确!');
    } catch (e) {
        alert('❌ JSON 格式错误: ' + e.message);
    }
}

function jvUploadFile() {
    document.getElementById('jvFileInput').click();
}

function jvHandleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('jvEditor').value = e.target.result;
        jvParse();
    };
    reader.readAsText(file);
    event.target.value = '';
}

function jvExportPng() {
    const container = document.getElementById('jvCanvasContainer');
    const canvas = container.querySelector('canvas');
    if (!canvas) {
        alert('请先输入 JSON 数据');
        return;
    }

    const link = document.createElement('a');
    link.download = 'json-vision-' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function jvExportJson() {
    if (!jvState.json) {
        alert('请先输入 JSON 数据');
        return;
    }

    const blob = new Blob([JSON.stringify(jvState.json, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'json-vision-data-' + Date.now() + '.json';
    link.href = URL.createObjectURL(blob);
    link.click();
}
