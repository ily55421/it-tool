var jsonFormatterComponent = `
<div class="json-formatter-container">
    <div class="json-formatter-header">
        <h2>JSON 格式化工具</h2>
        <div class="json-formatter-actions">
            <button class="btn btn-primary" onclick="jsonFormat()">格式化</button>
            <button class="btn btn-secondary" onclick="jsonCompress()">压缩</button>
            <button class="btn btn-secondary" onclick="jsonRemoveEscape()">去除转义</button>
            <button class="btn btn-secondary" onclick="jsonAddEscape()">添加转义</button>
            <button class="btn btn-secondary" onclick="jsonClear()">清空</button>
            <label class="btn btn-secondary">
                上传JSON
                <input type="file" accept=".json,.txt" onchange="jsonLoadFile(event)" style="display: none;">
            </label>
            <button class="btn btn-success" onclick="jsonCopyResult()">复制结果</button>
            <button class="btn btn-secondary" onclick="jsonLoadExample()">加载示例</button>
        </div>
    </div>
    <div class="json-formatter-main">
        <div class="json-formatter-panel">
            <div class="panel-header">
                <span>原始JSON</span>
                <span class="char-count" id="inputCharCount">0 字符</span>
            </div>
            <textarea id="jsonInput" placeholder="请输入JSON字符串..." oninput="jsonDebounce()"></textarea>
            <div class="error-message" id="jsonError"></div>
        </div>
        <div class="json-formatter-panel">
            <div class="panel-header">
                <span>格式化结果</span>
                <span class="char-count" id="outputCharCount">0 字符</span>
            </div>
            <div id="jsonOutput" class="json-output"></div>
        </div>
    </div>
</div>
`;

var jsonDebounceTimer = null;

// 本脚本现在由 router 在页面渲染之后执行（元素已存在），
// 再挂 DOMContentLoaded 永远不会触发，所以直接加载示例内容。
if (document.getElementById('jsonInput')) {
    jsonLoadExample();
}

function jsonLoadExample() {
    const example = {
        "name": "JSON格式化工具",
        "version": "1.0.0",
        "description": "一个强大的JSON处理工具",
        "features": [
            "格式化JSON",
            "压缩JSON",
            "去除转义",
            "添加转义",
            "节点折叠展开",
            "语法高亮",
            "文件上传"
        ],
        "author": {
            "name": "开发者",
            "email": "dev@example.com",
            "website": "https://example.com"
        },
        "settings": {
            "theme": "dark",
            "fontSize": 14,
            "autoFormat": true,
            "indentSize": 2
        },
        "stats": {
            "totalUsers": 10000,
            "dailyActive": 2500,
            "rating": 4.8
        },
        "isActive": true,
        "lastUpdated": "2024-05-15T10:30:00Z",
        "tags": ["json", "tool", "developer", "utility"],
        "metadata": null
    };
    
    document.getElementById('jsonInput').value = JSON.stringify(example, null, 2);
    jsonFormat();
    updateInputCharCount();
}

function jsonDebounce() {
    clearTimeout(jsonDebounceTimer);
    jsonDebounceTimer = setTimeout(jsonFormat, 300);
    updateInputCharCount();
}

function updateInputCharCount() {
    const input = document.getElementById('jsonInput');
    document.getElementById('inputCharCount').textContent = input.value.length + ' 字符';
}

function updateOutputCharCount() {
    const output = document.getElementById('jsonOutput');
    document.getElementById('outputCharCount').textContent = output.textContent.length + ' 字符';
}

function jsonFormat() {
    const input = document.getElementById('jsonInput').value.trim();
    const errorEl = document.getElementById('jsonError');
    const outputEl = document.getElementById('jsonOutput');
    
    if (!input) {
        errorEl.textContent = '';
        outputEl.innerHTML = '';
        updateOutputCharCount();
        return;
    }
    
    try {
        // 尝试解析JSON
        const obj = JSON.parse(input);
        // 渲染可折叠的JSON
        outputEl.innerHTML = renderJson(obj);
        errorEl.textContent = '';
        updateOutputCharCount();
    } catch (e) {
        errorEl.textContent = '❌ 格式错误: ' + e.message;
        outputEl.innerHTML = '';
        updateOutputCharCount();
    }
}

function renderJson(obj, indent = 0, parentKey = '') {
    let html = '';
    const indentStr = '&nbsp;'.repeat(indent * 4);
    const id = `node-${parentKey}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (obj === null) {
        return `${indentStr}<span class="json-null">null</span>`;
    }
    
    if (typeof obj !== 'object') {
        if (typeof obj === 'string') {
            return `${indentStr}<span class="json-string">"${escapeHtml(obj)}"</span>`;
        }
        if (typeof obj === 'number') {
            return `${indentStr}<span class="json-number">${obj}</span>`;
        }
        if (typeof obj === 'boolean') {
            return `${indentStr}<span class="json-boolean">${obj}</span>`;
        }
        return `${indentStr}${escapeHtml(String(obj))}`;
    }
    
    const isArray = Array.isArray(obj);
    const keys = Object.keys(obj);
    
    if (keys.length === 0) {
        return `${indentStr}${isArray ? '[]' : '{}'}`;
    }
    
    html += `${indentStr}<span class="json-toggle" onclick="toggleNode('${id}')">▼</span>`;
    html += isArray ? '[' : '{';
    html += `<div class="json-children" id="${id}">`;
    
    keys.forEach((key, index) => {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        
        html += '<div class="json-line">';
        if (!isArray) {
            html += `<span class="json-key">"${escapeHtml(key)}"</span>: `;
        }
        html += renderJson(value, indent + 1, newKey);
        if (index < keys.length - 1) {
            html += ',';
        }
        html += '</div>';
    });
    
    html += `</div>${indentStr}${isArray ? ']' : '}'}`;
    return html;
}

function toggleNode(id) {
    const node = document.getElementById(id);
    const toggle = node.previousElementSibling;
    if (node.style.display === 'none') {
        node.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        node.style.display = 'none';
        toggle.textContent = '▶';
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function jsonCompress() {
    const input = document.getElementById('jsonInput').value.trim();
    const errorEl = document.getElementById('jsonError');
    const outputEl = document.getElementById('jsonOutput');
    
    if (!input) {
        errorEl.textContent = '';
        outputEl.innerHTML = '';
        updateOutputCharCount();
        return;
    }
    
    try {
        const obj = JSON.parse(input);
        const compressed = JSON.stringify(obj);
        outputEl.innerHTML = syntaxHighlight(compressed);
        errorEl.textContent = '';
        updateOutputCharCount();
    } catch (e) {
        errorEl.textContent = '❌ 格式错误: ' + e.message;
        outputEl.innerHTML = '';
        updateOutputCharCount();
    }
}

function jsonRemoveEscape() {
    const input = document.getElementById('jsonInput');
    try {
        // 去除转义
        let value = input.value;
        // 处理双转义
        value = value.replace(/\\\\/g, '\\');
        // 处理引号转义
        value = value.replace(/\\"/g, '"');
        // 处理多余的转义
        value = value.replace(/\\(?!["\\/bfnrtu])/g, '');
        
        // 尝试解析验证
        JSON.parse(value);
        input.value = value;
        jsonFormat();
        document.getElementById('jsonError').textContent = '';
    } catch (e) {
        // 解析失败，直接替换
        input.value = input.value.replace(/\\/g, '');
        jsonFormat();
    }
    updateInputCharCount();
}

function jsonAddEscape() {
    const input = document.getElementById('jsonInput');
    let value = input.value;
    // 转义双引号
    value = value.replace(/"/g, '\\"');
    // 转义反斜杠
    value = value.replace(/\\/g, '\\\\');
    input.value = value;
    jsonFormat();
    updateInputCharCount();
}

function jsonClear() {
    document.getElementById('jsonInput').value = '';
    document.getElementById('jsonOutput').innerHTML = '';
    document.getElementById('jsonError').textContent = '';
    updateInputCharCount();
    updateOutputCharCount();
}

function jsonCopyResult() {
    const output = document.getElementById('jsonOutput');
    const text = output.textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('复制成功！');
    }).catch(() => {
        alert('复制失败，请手动复制');
    });
}

function jsonLoadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('jsonInput').value = e.target.result;
        jsonFormat();
        updateInputCharCount();
    };
    reader.readAsText(file);
    event.target.value = '';
}

function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}
