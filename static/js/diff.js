var diffComponent = `
<div class="diff-container" id="diffApp">
    <div class="diff-toolbar">
        <span class="diff-toolbar-title">🔍 DiffFlow 文本差异对比</span>
        <button class="diff-toolbar-btn active" data-view="side-by-side" onclick="diffSetView('side-by-side')">Side-by-Side</button>
        <button class="diff-toolbar-btn" data-view="unified" onclick="diffSetView('unified')">Unified</button>
        <button class="diff-toolbar-btn" data-view="inline" onclick="diffSetView('inline')">Inline</button>
        <div class="diff-toolbar-separator"></div>
        <button class="diff-toolbar-btn" id="diffIgnoreWs" onclick="diffToggleIgnoreWs()">Ignore Whitespace</button>
        <button class="diff-toolbar-btn" id="diffWordWrap" onclick="diffToggleWordWrap()">Word Wrap</button>
        <div class="diff-toolbar-separator"></div>
        <button class="diff-toolbar-btn" onclick="diffUploadFile('left')">Upload Left</button>
        <button class="diff-toolbar-btn" onclick="diffUploadFile('right')">Upload Right</button>
        <button class="diff-toolbar-btn" onclick="diffSwapTexts()">⇄ Swap</button>
        <button class="diff-toolbar-btn" onclick="diffClearAll()">Clear</button>
        <button class="diff-toolbar-btn" onclick="diffCopyResult()">Copy Result</button>
        <input type="file" id="diffFileLeft" class="diff-file-input" accept=".txt,.json,.js,.ts,.java,.xml,.yaml,.yml,.md,.py,.go,.sql" onchange="diffHandleFile(event,'left')">
        <input type="file" id="diffFileRight" class="diff-file-input" accept=".txt,.json,.js,.ts,.java,.xml,.yaml,.yml,.md,.py,.go,.sql" onchange="diffHandleFile(event,'right')">
    </div>
    <div class="diff-main-area">
        <div class="diff-input-section">
            <div class="diff-input-header">
                <span>Original</span>
                <span>VS</span>
                <span>Modified</span>
            </div>
            <div class="diff-input-panes">
                <div class="diff-input-pane">
                    <div class="diff-input-line-numbers" id="diffLeftLineNums"></div>
                    <textarea class="diff-input-textarea" id="diffLeft" placeholder="Original text..." oninput="diffDebounce()" onscroll="diffSyncScroll('left')"></textarea>
                    <div class="diff-input-highlight" id="diffLeftHighlight"></div>
                </div>
                <div class="diff-input-pane">
                    <div class="diff-input-line-numbers" id="diffRightLineNums"></div>
                    <textarea class="diff-input-textarea" id="diffRight" placeholder="Modified text..." oninput="diffDebounce()" onscroll="diffSyncScroll('right')"></textarea>
                    <div class="diff-input-highlight" id="diffRightHighlight"></div>
                </div>
            </div>
        </div>
        <div class="diff-result-section">
            <div class="diff-result-header">
                <span>Diff Result</span>
                <div class="diff-legend">
                    <span class="legend-item"><span class="legend-color added"></span> Added</span>
                    <span class="legend-item"><span class="legend-color removed"></span> Removed</span>
                    <span class="legend-item"><span class="legend-color modified"></span> Modified</span>
                </div>
            </div>
            <div class="diff-result-area" id="diffResultArea"></div>
        </div>
    </div>
    <div class="diff-status-bar" id="diffStatusBar">
        <span id="diffStatInfo">Waiting for input...</span>
    </div>
</div>
`;

var diffState = {
    view: 'side-by-side',
    ignoreWs: false,
    wordWrap: false,
    debounceTimer: null,
};

function diffDebounce() {
    clearTimeout(diffState.debounceTimer);
    diffState.debounceTimer = setTimeout(diffCompute, 100);
}

function diffGetText(side) {
    let text = document.getElementById(side === 'left' ? 'diffLeft' : 'diffRight').value;
    if (diffState.ignoreWs) {
        text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    return text;
}

function diffCompute() {
    const oldText = diffGetText('left');
    const newText = diffGetText('right');

    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    diffUpdateLineNumbers(oldLines.length, newLines.length);

    if (!oldText && !newText) {
        document.getElementById('diffResultArea').innerHTML = '<div class="diff-empty">Enter text in both panels to see differences</div>';
        document.getElementById('diffStatInfo').textContent = 'Waiting for input...';
        document.getElementById('diffLeftHighlight').innerHTML = '';
        document.getElementById('diffRightHighlight').innerHTML = '';
        return;
    }

    const lines = diffBuildLines(oldLines, newLines);

    let added = 0, removed = 0, unchanged = 0, modified = 0;
    lines.forEach(l => {
        if (l.type === 'add') added++;
        else if (l.type === 'remove') removed++;
        else if (l.type === 'modified') { modified++; added++; removed++; }
        else unchanged++;
    });

    if (diffState.view === 'side-by-side') {
        diffRenderSideBySide(lines);
    } else if (diffState.view === 'unified') {
        diffRenderUnified(lines);
    } else {
        diffRenderInline(lines);
    }

    diffUpdateInputHighlight(lines, oldLines, newLines);

    document.getElementById('diffStatInfo').innerHTML =
        `<span class="diff-stat-added">+${added} added</span> ` +
        `<span class="diff-stat-removed">-${removed} removed</span> ` +
        `<span class="diff-stat-modified">~${modified} modified</span> ` +
        `<span>${unchanged} unchanged</span> ` +
        `<span>| Lines: ${oldLines.length} → ${newLines.length}</span>`;
}

function diffBuildLines(oldLines, newLines) {
    const lcs = diffComputeLCS(oldLines, newLines);
    const lines = [];
    let i = 0, j = 0;

    for (const match of lcs) {
        while (i < match[0]) {
            lines.push({ type: 'remove', text: oldLines[i], oldNum: i + 1, newNum: null });
            i++;
        }
        while (j < match[1]) {
            lines.push({ type: 'add', text: newLines[j], oldNum: null, newNum: j + 1 });
            j++;
        }
        lines.push({ type: 'equal', text: oldLines[i], oldNum: i + 1, newNum: j + 1 });
        i++;
        j++;
    }

    while (i < oldLines.length) {
        lines.push({ type: 'remove', text: oldLines[i], oldNum: i + 1, newNum: null });
        i++;
    }
    while (j < newLines.length) {
        lines.push({ type: 'add', text: newLines[j], oldNum: null, newNum: j + 1 });
        j++;
    }

    const merged = [];
    let k = 0;
    while (k < lines.length) {
        if (lines[k].type === 'remove' && k + 1 < lines.length && lines[k + 1].type === 'add') {
            const charDiffs = diffCharDiff(lines[k].text, lines[k + 1].text);
            merged.push({
                type: 'modified',
                oldText: lines[k].text,
                newText: lines[k + 1].text,
                oldNum: lines[k].oldNum,
                newNum: lines[k + 1].newNum,
                charDiffs: charDiffs
            });
            k += 2;
        } else {
            merged.push(lines[k]);
            k++;
        }
    }

    return merged;
}

function diffComputeLCS(a, b) {
    const m = a.length, n = b.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            lcs.unshift([i - 1, j - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return lcs;
}

function diffCharDiff(oldText, newText) {
    const m = oldText.length, n = newText.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldText[i - 1] === newText[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const diffs = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldText[i - 1] === newText[j - 1]) {
            diffs.unshift([0, oldText[i - 1]]);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diffs.unshift([1, newText[j - 1]]);
            j--;
        } else if (i > 0) {
            diffs.unshift([-1, oldText[i - 1]]);
            i--;
        }
    }

    const merged = [];
    let currentOp = null;
    let currentText = '';
    for (const [op, char] of diffs) {
        if (op === currentOp) {
            currentText += char;
        } else {
            if (currentOp !== null) {
                merged.push([currentOp, currentText]);
            }
            currentOp = op;
            currentText = char;
        }
    }
    if (currentOp !== null) {
        merged.push([currentOp, currentText]);
    }
    return merged;
}

function diffUpdateLineNumbers(leftCount, rightCount) {
    let leftNums = '';
    for (let i = 1; i <= leftCount; i++) {
        leftNums += `<span>${i}</span>`;
    }
    document.getElementById('diffLeftLineNums').innerHTML = leftNums;

    let rightNums = '';
    for (let i = 1; i <= rightCount; i++) {
        rightNums += `<span>${i}</span>`;
    }
    document.getElementById('diffRightLineNums').innerHTML = rightNums;
}

function diffEscapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function diffRenderCharDiffs(charDiffs, side) {
    if (!charDiffs || !Array.isArray(charDiffs)) {
        return '&nbsp;';
    }
    let html = '';
    for (const diff of charDiffs) {
        if (!Array.isArray(diff) || diff.length < 2) continue;
        const op = diff[0];
        const text = diff[1];
        const escaped = diffEscapeHtml(text);
        if (op === 0) {
            html += escaped;
        } else if (op === -1 && side === 'old') {
            html += `<span class="diff-char-remove">${escaped}</span>`;
        } else if (op === 1 && side === 'new') {
            html += `<span class="diff-char-add">${escaped}</span>`;
        }
    }
    return html || '&nbsp;';
}

function diffRenderSideBySide(lines) {
    const area = document.getElementById('diffResultArea');
    const wrapStyle = diffState.wordWrap ? 'pre-wrap' : 'pre';

    let leftHtml = '';
    let rightHtml = '';

    for (const line of lines) {
        if (line.type === 'equal') {
            leftHtml += `<div class="diff-line"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix"> </span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
            rightHtml += `<div class="diff-line"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix"> </span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'remove') {
            leftHtml += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
            rightHtml += `<div class="diff-line empty"><span class="diff-line-num"></span><span class="diff-line-prefix"></span><span class="diff-line-text" style="white-space:${wrapStyle}"></span></div>`;
        } else if (line.type === 'add') {
            leftHtml += `<div class="diff-line empty"><span class="diff-line-num"></span><span class="diff-line-prefix"></span><span class="diff-line-text" style="white-space:${wrapStyle}"></span></div>`;
            rightHtml += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'modified') {
            leftHtml += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'old')}</span></div>`;
            rightHtml += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'new')}</span></div>`;
        }
    }

    area.innerHTML = `
        <div class="diff-side-by-side">
            <div class="diff-side-pane">
                <div class="diff-side-header">Original</div>
                <div class="diff-side-content">${leftHtml}</div>
            </div>
            <div class="diff-side-pane">
                <div class="diff-side-header">Modified</div>
                <div class="diff-side-content">${rightHtml}</div>
            </div>
        </div>
    `;

    const leftPane = area.querySelector('.diff-side-content:first-child');
    const rightPane = area.querySelector('.diff-side-content:last-child');
    diffSyncScrollPanels(leftPane, rightPane);
}

function diffRenderUnified(lines) {
    const area = document.getElementById('diffResultArea');
    const wrapStyle = diffState.wordWrap ? 'pre-wrap' : 'pre';

    let html = '<div class="diff-unified">';
    let inHunk = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.type !== 'equal' && !inHunk) {
            inHunk = true;
            const oldStart = line.oldNum || (lines[i-1]?.oldNum || 1);
            const newStart = line.newNum || (lines[i-1]?.newNum || 1);
            html += `<div class="diff-hunk-header"><span class="diff-hunk-marker">@@</span><span class="diff-hunk-info"> -${oldStart} +${newStart} @@</span></div>`;
        } else if (line.type === 'equal' && inHunk && (i === lines.length - 1 || lines[i+1]?.type === 'equal')) {
            inHunk = false;
        }

        if (line.type === 'equal') {
            html += `<div class="diff-line"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix"> </span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'remove') {
            html += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'add') {
            html += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'modified') {
            html += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'old')}</span></div>`;
            html += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'new')}</span></div>`;
        }
    }
    html += '</div>';
    area.innerHTML = html;
}

function diffRenderInline(lines) {
    const area = document.getElementById('diffResultArea');
    const wrapStyle = diffState.wordWrap ? 'pre-wrap' : 'pre';

    let html = '<div class="diff-inline">';
    for (const line of lines) {
        if (line.type === 'equal') {
            html += `<div class="diff-line"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix"> </span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'remove') {
            html += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'add') {
            html += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffEscapeHtml(line.text)}</span></div>`;
        } else if (line.type === 'modified') {
            html += `<div class="diff-line removed"><span class="diff-line-num">${line.oldNum}</span><span class="diff-line-prefix">-</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'old')}</span></div>`;
            html += `<div class="diff-line added"><span class="diff-line-num">${line.newNum}</span><span class="diff-line-prefix">+</span><span class="diff-line-text" style="white-space:${wrapStyle}">${diffRenderCharDiffs(line.charDiffs, 'new')}</span></div>`;
        }
    }
    html += '</div>';
    area.innerHTML = html;
}

function diffUpdateInputHighlight(lines, oldLines, newLines) {
    let leftHighlight = '';
    let rightHighlight = '';
    
    for (const line of lines) {
        if (line.type === 'equal') {
            leftHighlight += `<div></div>`;
            rightHighlight += `<div></div>`;
        } else if (line.type === 'remove') {
            leftHighlight += `<div class="diff-highlight-remove"></div>`;
            rightHighlight += `<div></div>`;
        } else if (line.type === 'add') {
            leftHighlight += `<div></div>`;
            rightHighlight += `<div class="diff-highlight-add"></div>`;
        } else if (line.type === 'modified') {
            leftHighlight += `<div class="diff-highlight-remove"></div>`;
            rightHighlight += `<div class="diff-highlight-add"></div>`;
        }
    }
    
    for (let i = lines.length; i < oldLines.length; i++) {
        leftHighlight += `<div></div>`;
    }
    for (let i = lines.length; i < newLines.length; i++) {
        rightHighlight += `<div></div>`;
    }

    document.getElementById('diffLeftHighlight').innerHTML = leftHighlight;
    document.getElementById('diffRightHighlight').innerHTML = rightHighlight;
}

function diffSyncScroll(side) {
    const leftArea = document.getElementById('diffLeft').parentElement;
    const rightArea = document.getElementById('diffRight').parentElement;
    
    if (side === 'left') {
        rightArea.scrollTop = leftArea.scrollTop;
    } else {
        leftArea.scrollTop = rightArea.scrollTop;
    }
}

function diffSyncScrollPanels(pane1, pane2) {
    if (!pane1 || !pane2) return;
    let syncing = false;
    pane1.addEventListener('scroll', () => {
        if (!syncing) { syncing = true; pane2.scrollTop = pane1.scrollTop; syncing = false; }
    });
    pane2.addEventListener('scroll', () => {
        if (!syncing) { syncing = true; pane1.scrollTop = pane2.scrollTop; syncing = false; }
    });
}

function diffSetView(view) {
    diffState.view = view;
    document.querySelectorAll('.diff-toolbar-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    diffCompute();
}

function diffToggleIgnoreWs() {
    diffState.ignoreWs = !diffState.ignoreWs;
    document.getElementById('diffIgnoreWs').classList.toggle('active', diffState.ignoreWs);
    diffCompute();
}

function diffToggleWordWrap() {
    diffState.wordWrap = !diffState.wordWrap;
    document.getElementById('diffWordWrap').classList.toggle('active', diffState.wordWrap);
    diffCompute();
}

function diffSwapTexts() {
    const left = document.getElementById('diffLeft');
    const right = document.getElementById('diffRight');
    const tmp = left.value;
    left.value = right.value;
    right.value = tmp;
    diffCompute();
}

function diffClearPane(side) {
    document.getElementById(side === 'left' ? 'diffLeft' : 'diffRight').value = '';
    diffDebounce();
}

function diffClearAll() {
    document.getElementById('diffLeft').value = '';
    document.getElementById('diffRight').value = '';
    diffCompute();
}

function diffUploadFile(side) {
    document.getElementById(side === 'left' ? 'diffFileLeft' : 'diffFileRight').click();
}

function diffHandleFile(event, side) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById(side === 'left' ? 'diffLeft' : 'diffRight').value = e.target.result;
        diffCompute();
    };
    reader.readAsText(file);
    event.target.value = '';
}

function diffCopyResult() {
    const resultArea = document.getElementById('diffResultArea');
    if (!resultArea.textContent.trim()) {
        alert('No diff result to copy');
        return;
    }
    navigator.clipboard.writeText(resultArea.textContent).then(() => {
        alert('Diff result copied to clipboard');
    });
}
