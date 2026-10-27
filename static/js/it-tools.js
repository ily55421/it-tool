// IT-Tools 在线工具箱前端逻辑
// 分类导航与首页图标墙已迁到 tools-registry.js + app-center.js（应用中心）。

// ==================== 文本处理工具 ====================

const textStatsComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=text" class="back-btn">← 返回</a>
        <h1>📊 文本统计分析</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>输入文本</label>
            <textarea id="statsInput" class="tool-textarea" placeholder="在此输入或粘贴文本..."></textarea>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="analyzeText()">分析统计</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearStats()">清空</button>
        </div>
        <div id="statsResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">统计结果</span>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="charCount">0</div>
                    <div class="stat-label">字符数（含空格）</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="charCountNoSpace">0</div>
                    <div class="stat-label">字符数（不含空格）</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="lineCount">0</div>
                    <div class="stat-label">行数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="wordCount">0</div>
                    <div class="stat-label">单词数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="byteCount">0</div>
                    <div class="stat-label">字节数</div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

const hashTextComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=text" class="back-btn">← 返回</a>
        <h1>#️⃣ 文本哈希生成</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>输入文本</label>
            <textarea id="hashInput" class="tool-textarea" placeholder="在此输入文本..."></textarea>
        </div>
        <div class="tool-form-group">
            <label>哈希算法</label>
            <select id="hashAlgorithm" class="tool-select">
                <option value="md5">MD5</option>
                <option value="sha1">SHA1</option>
                <option value="sha256" selected>SHA256</option>
                <option value="sha512">SHA512</option>
            </select>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateHash()">生成哈希</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearHash()">清空</button>
        </div>
        <div id="hashResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">哈希结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('hashOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="hashOutput"></div>
        </div>
    </div>
</div>
`;

const tokenGenComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=text" class="back-btn">← 返回</a>
        <h1>🔑 Token生成器</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>Token长度</label>
            <input type="number" id="tokenLength" class="tool-input" value="32" min="1" max="512">
        </div>
        <div class="tool-form-group">
            <label>字符选项</label>
            <div class="tool-checkbox-group">
                <label class="tool-checkbox">
                    <input type="checkbox" id="tokenUpper" checked> 大写字母
                </label>
                <label class="tool-checkbox">
                    <input type="checkbox" id="tokenLower" checked> 小写字母
                </label>
                <label class="tool-checkbox">
                    <input type="checkbox" id="tokenNumbers" checked> 数字
                </label>
                <label class="tool-checkbox">
                    <input type="checkbox" id="tokenSymbols"> 特殊符号
                </label>
            </div>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateToken()">生成Token</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearToken()">清空</button>
        </div>
        <div id="tokenResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">生成的Token</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('tokenOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="tokenOutput"></div>
        </div>
    </div>
</div>
`;

const jsonYamlComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=text" class="back-btn">← 返回</a>
        <h1>🔄 JSON-YAML互转</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>转换方向</label>
            <select id="convertDirection" class="tool-select">
                <option value="json-to-yaml">JSON → YAML</option>
                <option value="yaml-to-json">YAML → JSON</option>
            </select>
        </div>
        <div class="tool-form-group">
            <label>输入内容</label>
            <textarea id="convertInput" class="tool-textarea" placeholder="在此输入JSON或YAML内容..."></textarea>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="convertFormat()">转换</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearConvert()">清空</button>
        </div>
        <div id="convertResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">转换结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('convertOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="convertOutput"></div>
        </div>
    </div>
</div>
`;

// ==================== 加密安全工具 ====================

const bcryptComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=security" class="back-btn">← 返回</a>
        <h1>🔐 Bcrypt加密</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>密码文本</label>
            <input type="text" id="bcryptInput" class="tool-input" placeholder="输入要加密的密码...">
        </div>
        <div class="tool-form-group">
            <label>轮数 (4-31)</label>
            <input type="number" id="bcryptRounds" class="tool-input" value="12" min="4" max="31">
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="bcryptHash()">加密</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearBcrypt()">清空</button>
        </div>
        <div id="bcryptResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">加密结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('bcryptOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="bcryptOutput"></div>
        </div>
    </div>
</div>
`;

const encryptComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=security" class="back-btn">← 返回</a>
        <h1>🔑 加密/解密</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>操作</label>
            <select id="encryptAction" class="tool-select">
                <option value="encrypt">加密</option>
                <option value="decrypt">解密</option>
            </select>
        </div>
        <div class="tool-form-group">
            <label>密钥</label>
            <input type="text" id="encryptKey" class="tool-input" placeholder="输入加密密钥...">
        </div>
        <div class="tool-form-group">
            <label>文本</label>
            <textarea id="encryptInput" class="tool-textarea" placeholder="输入要加密/解密的文本..."></textarea>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="doEncrypt()">执行</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearEncrypt()">清空</button>
        </div>
        <div id="encryptResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('encryptOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="encryptOutput"></div>
        </div>
    </div>
</div>
`;

const hmacComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=security" class="back-btn">← 返回</a>
        <h1>🔏 HMAC生成器</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>文本</label>
            <textarea id="hmacInput" class="tool-textarea" placeholder="输入文本..."></textarea>
        </div>
        <div class="tool-form-group">
            <label>密钥</label>
            <input type="text" id="hmacKey" class="tool-input" placeholder="输入密钥...">
        </div>
        <div class="tool-form-group">
            <label>算法</label>
            <select id="hmacAlgorithm" class="tool-select">
                <option value="sha256" selected>SHA256</option>
                <option value="sha1">SHA1</option>
                <option value="md5">MD5</option>
            </select>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateHmac()">生成HMAC</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearHmac()">清空</button>
        </div>
        <div id="hmacResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">HMAC结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('hmacOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="hmacOutput"></div>
        </div>
    </div>
</div>
`;

const bip39Component = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=security" class="back-btn">← 返回</a>
        <h1>📝 BIP39助记词</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>助记词强度</label>
            <select id="bip39Strength" class="tool-select">
                <option value="128">128位 (12个单词)</option>
                <option value="160">160位 (15个单词)</option>
                <option value="192">192位 (18个单词)</option>
                <option value="224">224位 (21个单词)</option>
                <option value="256">256位 (24个单词)</option>
            </select>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateBip39()">生成助记词</button>
        </div>
        <div id="bip39Result" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">助记词</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('bip39Output')">复制</button>
            </div>
            <div class="tool-result-content" id="bip39Output"></div>
        </div>
    </div>
</div>
`;

// ==================== ID生成器 ====================

const uuidComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=id" class="back-btn">← 返回</a>
        <h1>🔢 UUID生成器</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>版本</label>
            <select id="uuidVersion" class="tool-select">
                <option value="v4">UUID v4 (随机)</option>
                <option value="v1">UUID v1 (时间戳)</option>
            </select>
        </div>
        <div class="tool-form-group">
            <label>生成数量 (1-100)</label>
            <input type="number" id="uuidCount" class="tool-input" value="1" min="1" max="100">
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateUuid()">生成UUID</button>
        </div>
        <div id="uuidResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">生成的UUID</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('uuidOutput')">复制全部</button>
            </div>
            <div class="tool-result-list" id="uuidOutput"></div>
        </div>
    </div>
</div>
`;

const ulidComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=id" class="back-btn">← 返回</a>
        <h1>⏱️ ULID生成器</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>生成数量 (1-100)</label>
            <input type="number" id="ulidCount" class="tool-input" value="1" min="1" max="100">
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateUlid()">生成ULID</button>
        </div>
        <div id="ulidResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">生成的ULID</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('ulidOutput')">复制全部</button>
            </div>
            <div class="tool-result-list" id="ulidOutput"></div>
        </div>
    </div>
</div>
`;

// ==================== Git备忘录 ====================

const gitToolsComponent = `
<div class="tools-container">
    <div class="tools-header">
        <h1>📋 Git备忘录</h1>
        <p>常用Git命令速查</p>
    </div>
    <div class="git-cheat-sheet">
        <div class="git-section">
            <h3>📁 仓库操作</h3>
            <div class="git-command">
                <code>git init</code>
                <span class="git-command-desc">初始化新仓库</span>
            </div>
            <div class="git-command">
                <code>git clone &lt;url&gt;</code>
                <span class="git-command-desc">克隆远程仓库</span>
            </div>
            <div class="git-command">
                <code>git status</code>
                <span class="git-command-desc">查看工作区状态</span>
            </div>
            <div class="git-command">
                <code>git log</code>
                <span class="git-command-desc">查看提交历史</span>
            </div>
        </div>
        <div class="git-section">
            <h3>📝 基本操作</h3>
            <div class="git-command">
                <code>git add &lt;file&gt;</code>
                <span class="git-command-desc">添加文件到暂存区</span>
            </div>
            <div class="git-command">
                <code>git add .</code>
                <span class="git-command-desc">添加所有修改</span>
            </div>
            <div class="git-command">
                <code>git commit -m "msg"</code>
                <span class="git-command-desc">提交暂存区更改</span>
            </div>
            <div class="git-command">
                <code>git push</code>
                <span class="git-command-desc">推送到远程仓库</span>
            </div>
            <div class="git-command">
                <code>git pull</code>
                <span class="git-command-desc">拉取远程更新</span>
            </div>
        </div>
        <div class="git-section">
            <h3>🌿 分支管理</h3>
            <div class="git-command">
                <code>git branch</code>
                <span class="git-command-desc">列出所有分支</span>
            </div>
            <div class="git-command">
                <code>git branch &lt;name&gt;</code>
                <span class="git-command-desc">创建新分支</span>
            </div>
            <div class="git-command">
                <code>git checkout &lt;branch&gt;</code>
                <span class="git-command-desc">切换分支</span>
            </div>
            <div class="git-command">
                <code>git merge &lt;branch&gt;</code>
                <span class="git-command-desc">合并分支</span>
            </div>
            <div class="git-command">
                <code>git branch -d &lt;name&gt;</code>
                <span class="git-command-desc">删除分支</span>
            </div>
        </div>
        <div class="git-section">
            <h3>↩️ 撤销操作</h3>
            <div class="git-command">
                <code>git restore &lt;file&gt;</code>
                <span class="git-command-desc">恢复文件到上次提交</span>
            </div>
            <div class="git-command">
                <code>git reset HEAD &lt;file&gt;</code>
                <span class="git-command-desc">取消暂存文件</span>
            </div>
            <div class="git-command">
                <code>git revert &lt;commit&gt;</code>
                <span class="git-command-desc">撤销指定提交</span>
            </div>
            <div class="git-command">
                <code>git stash</code>
                <span class="git-command-desc">暂存当前更改</span>
            </div>
        </div>
        <div class="git-section">
            <h3>🔗 远程操作</h3>
            <div class="git-command">
                <code>git remote -v</code>
                <span class="git-command-desc">查看远程仓库</span>
            </div>
            <div class="git-command">
                <code>git fetch</code>
                <span class="git-command-desc">获取远程更新</span>
            </div>
            <div class="git-command">
                <code>git push -u origin &lt;branch&gt;</code>
                <span class="git-command-desc">推送并关联分支</span>
            </div>
        </div>
        <div class="git-section">
            <h3>🔍 查看信息</h3>
            <div class="git-command">
                <code>git diff</code>
                <span class="git-command-desc">查看工作区差异</span>
            </div>
            <div class="git-command">
                <code>git show &lt;commit&gt;</code>
                <span class="git-command-desc">查看提交详情</span>
            </div>
            <div class="git-command">
                <code>git blame &lt;file&gt;</code>
                <span class="git-command-desc">查看文件修改历史</span>
            </div>
        </div>
    </div>
</div>
`;

// ==================== 其他工具 ====================

const booleanComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=other" class="back-btn">← 返回</a>
        <h1>✅ 布尔值处理</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>布尔表达式</label>
            <input type="text" id="booleanInput" class="tool-input" placeholder="例如: True and False or not True">
        </div>
        <div class="tool-form-group">
            <label>支持的运算符</label>
            <div style="background:#f8fafc;padding:12px;border-radius:6px;font-family:monospace;font-size:0.9rem;color:#64748b;">
                and / && (与) | or / || (或) | not / ! (非) | True / False
            </div>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="evaluateBoolean()">计算</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearBoolean()">清空</button>
        </div>
        <div id="booleanResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">计算结果</span>
            </div>
            <div class="tool-result-content" id="booleanOutput"></div>
        </div>
    </div>
</div>
`;

const urlParamsComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <a href="#/apps?cat=other" class="back-btn">← 返回</a>
        <h1>🔗 URL查询参数</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>操作</label>
            <select id="urlAction" class="tool-select" onchange="toggleUrlMode()">
                <option value="parse">解析URL</option>
                <option value="build">构建URL</option>
            </select>
        </div>
        <div id="parseMode">
            <div class="tool-form-group">
                <label>URL</label>
                <input type="text" id="urlInput" class="tool-input" placeholder="https://example.com?key1=value1&key2=value2">
            </div>
        </div>
        <div id="buildMode" style="display:none;">
            <div class="tool-form-group">
                <label>基础URL</label>
                <input type="text" id="urlBase" class="tool-input" placeholder="https://example.com">
            </div>
            <div class="tool-form-group">
                <label>参数 (JSON格式)</label>
                <textarea id="urlParamsInput" class="tool-textarea" placeholder='{"key1": "value1", "key2": "value2"}'></textarea>
            </div>
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="processUrl()">执行</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearUrl()">清空</button>
        </div>
        <div id="urlResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">结果</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('urlOutput')">复制</button>
            </div>
            <div class="tool-result-content" id="urlOutput"></div>
        </div>
    </div>
</div>
`;

// ==================== FinalShell 离线激活码生成器 ====================

const finalShellComponent = `
<div class="tool-detail">
    <div class="tool-detail-header">
        <h1>🔑 FinalShell 离线激活码生成器</h1>
    </div>
    <div class="tool-form">
        <div class="tool-form-group">
            <label>机器码</label>
            <input type="text" id="machineCode" class="tool-input" placeholder="请输入机器码...">
        </div>
        <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" onclick="generateFinalShellCode()">生成授权码</button>
            <button class="tool-btn tool-btn-secondary" onclick="clearFinalShell()">清空</button>
        </div>
        <div id="finalshellResult" class="tool-result" style="display:none;">
            <div class="tool-result-header">
                <span class="tool-result-title">生成的授权码</span>
                <button class="tool-btn tool-btn-secondary" onclick="copyResult('finalshellOutput')">复制全部</button>
            </div>
            <div class="tool-result-content" id="finalshellOutput" style="white-space: pre-wrap; font-family: Consolas, Monaco, 'Courier New', monospace;"></div>
        </div>
    </div>
    <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <p style="margin:0; color:#92400e; font-size:0.9rem;"><strong>⚠️ 使用说明：</strong></p>
        <ul style="margin:8px 0 0 20px; color:#92400e; font-size:0.85rem;">
            <li>请输入您的 FinalShell 机器码</li>
            <li>支持 FinalShell &lt; 3.9.6、≥ 3.9.6、4.5、4.6 版本</li>
            <li>提供高级版和专业版两种授权码</li>
        </ul>
    </div>
</div>
`;

// ==================== 工具函数 ====================

async function apiCall(endpoint, data) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result;
    } catch (error) {
        return { error: error.message };
    }
}

function showResult(elementId, content) {
    const el = document.getElementById(elementId);
    if (el) {
        el.style.display = 'block';
        const contentEl = el.querySelector('.tool-result-content') || el;
        if (contentEl) contentEl.textContent = content;
    }
}

function hideResult(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = 'none';
}

function setOutput(elementId, content) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = content;
}

function copyResult(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        navigator.clipboard.writeText(el.textContent).then(() => {
            alert('已复制到剪贴板');
        });
    }
}

// ==================== 文本统计功能 ====================

async function analyzeText() {
    const text = document.getElementById('statsInput').value;
    if (!text) {
        alert('请输入文本');
        return;
    }
    
    const result = await apiCall('/api/text-stats', { text });
    if (result.success) {
        document.getElementById('charCount').textContent = result.chars_with_spaces;
        document.getElementById('charCountNoSpace').textContent = result.chars_without_spaces;
        document.getElementById('lineCount').textContent = result.lines;
        document.getElementById('wordCount').textContent = result.words;
        document.getElementById('byteCount').textContent = result.bytes;
        document.getElementById('statsResult').style.display = 'block';
    } else {
        alert(result.error || '分析失败');
    }
}

function clearStats() {
    document.getElementById('statsInput').value = '';
    document.getElementById('statsResult').style.display = 'none';
}

// ==================== 哈希生成功能 ====================

async function generateHash() {
    const text = document.getElementById('hashInput').value;
    const algorithm = document.getElementById('hashAlgorithm').value;
    if (!text) {
        alert('请输入文本');
        return;
    }
    
    const result = await apiCall('/api/hash-text', { text, algorithm });
    if (result.success) {
        setOutput('hashOutput', result.hash);
        document.getElementById('hashResult').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

function clearHash() {
    document.getElementById('hashInput').value = '';
    document.getElementById('hashResult').style.display = 'none';
}

// ==================== Token生成功能 ====================

async function generateToken() {
    const length = document.getElementById('tokenLength').value;
    const include_uppercase = document.getElementById('tokenUpper').checked;
    const include_lowercase = document.getElementById('tokenLower').checked;
    const include_numbers = document.getElementById('tokenNumbers').checked;
    const include_symbols = document.getElementById('tokenSymbols').checked;
    
    const result = await apiCall('/api/generate-token', {
        length, include_uppercase, include_lowercase, include_numbers, include_symbols
    });
    
    if (result.success) {
        setOutput('tokenOutput', result.token);
        document.getElementById('tokenResult').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

function clearToken() {
    document.getElementById('tokenLength').value = 32;
    document.getElementById('tokenUpper').checked = true;
    document.getElementById('tokenLower').checked = true;
    document.getElementById('tokenNumbers').checked = true;
    document.getElementById('tokenSymbols').checked = false;
    document.getElementById('tokenResult').style.display = 'none';
}

// ==================== JSON-YAML转换功能 ====================

async function convertFormat() {
    const text = document.getElementById('convertInput').value;
    const direction = document.getElementById('convertDirection').value;
    if (!text) {
        alert('请输入内容');
        return;
    }
    
    const result = await apiCall('/api/json-yaml-convert', { text, direction });
    if (result.success) {
        setOutput('convertOutput', result.result);
        document.getElementById('convertResult').style.display = 'block';
    } else {
        alert(result.error || '转换失败');
    }
}

function clearConvert() {
    document.getElementById('convertInput').value = '';
    document.getElementById('convertResult').style.display = 'none';
}

// ==================== Bcrypt功能 ====================

async function bcryptHash() {
    const text = document.getElementById('bcryptInput').value;
    const rounds = document.getElementById('bcryptRounds').value;
    if (!text) {
        alert('请输入密码');
        return;
    }
    
    const result = await apiCall('/api/bcrypt', { text, rounds });
    if (result.success) {
        setOutput('bcryptOutput', result.hash);
        document.getElementById('bcryptResult').style.display = 'block';
    } else {
        alert(result.error || '加密失败');
    }
}

function clearBcrypt() {
    document.getElementById('bcryptInput').value = '';
    document.getElementById('bcryptResult').style.display = 'none';
}

// ==================== 加密解密功能 ====================

async function doEncrypt() {
    const text = document.getElementById('encryptInput').value;
    const key = document.getElementById('encryptKey').value;
    const action = document.getElementById('encryptAction').value;
    if (!text || !key) {
        alert('请输入文本和密钥');
        return;
    }
    
    const result = await apiCall('/api/encrypt', { text, key, action });
    if (result.success) {
        setOutput('encryptOutput', result.result);
        document.getElementById('encryptResult').style.display = 'block';
    } else {
        alert(result.error || '操作失败');
    }
}

function clearEncrypt() {
    document.getElementById('encryptInput').value = '';
    document.getElementById('encryptKey').value = '';
    document.getElementById('encryptResult').style.display = 'none';
}

// ==================== HMAC功能 ====================

async function generateHmac() {
    const text = document.getElementById('hmacInput').value;
    const key = document.getElementById('hmacKey').value;
    const algorithm = document.getElementById('hmacAlgorithm').value;
    if (!text || !key) {
        alert('请输入文本和密钥');
        return;
    }
    
    const result = await apiCall('/api/hmac', { text, key, algorithm });
    if (result.success) {
        setOutput('hmacOutput', result.hmac);
        document.getElementById('hmacResult').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

function clearHmac() {
    document.getElementById('hmacInput').value = '';
    document.getElementById('hmacKey').value = '';
    document.getElementById('hmacResult').style.display = 'none';
}

// ==================== BIP39功能 ====================

async function generateBip39() {
    const strength = document.getElementById('bip39Strength').value;
    
    const result = await apiCall('/api/bip39', { strength });
    if (result.success) {
        setOutput('bip39Output', result.mnemonic);
        document.getElementById('bip39Result').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

// ==================== UUID功能 ====================

async function generateUuid() {
    const version = document.getElementById('uuidVersion').value;
    const count = document.getElementById('uuidCount').value;
    
    const result = await apiCall('/api/uuid', { version, count });
    if (result.success) {
        const container = document.getElementById('uuidOutput');
        container.innerHTML = result.uuids.map(u => `
            <div class="tool-result-item">
                <span>${u}</span>
                <button class="tool-btn tool-btn-secondary" onclick="navigator.clipboard.writeText('${u}')">复制</button>
            </div>
        `).join('');
        document.getElementById('uuidResult').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

// ==================== ULID功能 ====================

async function generateUlid() {
    const count = document.getElementById('ulidCount').value;
    
    const result = await apiCall('/api/ulid', { count });
    if (result.success) {
        const container = document.getElementById('ulidOutput');
        container.innerHTML = result.ulids.map(u => `
            <div class="tool-result-item">
                <span>${u}</span>
                <button class="tool-btn tool-btn-secondary" onclick="navigator.clipboard.writeText('${u}')">复制</button>
            </div>
        `).join('');
        document.getElementById('ulidResult').style.display = 'block';
    } else {
        alert(result.error || '生成失败');
    }
}

// ==================== 布尔值功能 ====================

async function evaluateBoolean() {
    const expression = document.getElementById('booleanInput').value;
    if (!expression) {
        alert('请输入表达式');
        return;
    }
    
    const result = await apiCall('/api/boolean', { expression });
    if (result.success) {
        setOutput('booleanOutput', `${result.expression} = ${result.result}`);
        document.getElementById('booleanResult').style.display = 'block';
    } else {
        alert(result.error || '计算失败');
    }
}

function clearBoolean() {
    document.getElementById('booleanInput').value = '';
    document.getElementById('booleanResult').style.display = 'none';
}

// ==================== URL参数功能 ====================

function toggleUrlMode() {
    const action = document.getElementById('urlAction').value;
    if (action === 'parse') {
        document.getElementById('parseMode').style.display = 'block';
        document.getElementById('buildMode').style.display = 'none';
    } else {
        document.getElementById('parseMode').style.display = 'none';
        document.getElementById('buildMode').style.display = 'block';
    }
}

async function processUrl() {
    const action = document.getElementById('urlAction').value;
    
    if (action === 'parse') {
        const url = document.getElementById('urlInput').value;
        if (!url) {
            alert('请输入URL');
            return;
        }
        const result = await apiCall('/api/url-params', { action, url });
        if (result.success) {
            const output = `协议: ${result.scheme}\n主机: ${result.netloc}\n路径: ${result.path}\n查询参数: ${JSON.stringify(result.query_params, null, 2)}`;
            setOutput('urlOutput', output);
            document.getElementById('urlResult').style.display = 'block';
        } else {
            alert(result.error || '解析失败');
        }
    } else {
        const base_url = document.getElementById('urlBase').value;
        const paramsText = document.getElementById('urlParamsInput').value;
        if (!base_url) {
            alert('请输入基础URL');
            return;
        }
        let params = {};
        try {
            params = JSON.parse(paramsText || '{}');
        } catch (e) {
            alert('参数格式错误，请使用JSON格式');
            return;
        }
        const result = await apiCall('/api/url-params', { action, base_url, params });
        if (result.success) {
            setOutput('urlOutput', result.url);
            document.getElementById('urlResult').style.display = 'block';
        } else {
            alert(result.error || '构建失败');
        }
    }
}

function clearUrl() {
    document.getElementById('urlInput').value = '';
    document.getElementById('urlBase').value = '';
    document.getElementById('urlParamsInput').value = '';
    document.getElementById('urlResult').style.display = 'none';
}

// ==================== FinalShell 离线激活码生成器功能 ====================

async function generateFinalShellCode() {
    const code = document.getElementById('machineCode').value.trim();

    if (!code) {
        alert('请输入机器码');
        return;
    }

    // crypto-js 按需加载：只有真的生成激活码时才下载
    await ITLibs.load('crypto');

    function md5(str) { return CryptoJS.MD5(str).toString(); }
    function keccak384(str) { return CryptoJS.SHA3(str, { outputLength: 384 }).toString(); }
    
    let res = '';

    res += 'FinalShell < 3.9.6\n';
    res += '高级版:' + md5('61305' + code + '8552').slice(8, 24) + '\n';
    res += '专业版:' + md5('2356' + code + '13593').slice(8, 24) + '\n\n';

    res += 'FinalShell ≥ 3.9.6\n';
    res += '高级版:' + keccak384(code + 'hSf(78cvVlS5E').slice(12, 28) + '\n';
    res += '专业版:' + keccak384(code + 'FF3Go(*Xvbb5s2').slice(12, 28) + '\n\n';

    res += 'FinalShell 4.5\n';
    res += '高级版:' + keccak384(code + 'wcegS3gzA$').slice(12, 28) + '\n';
    res += '专业版:' + keccak384(code + 'b(xxkHn%z);x').slice(12, 28) + '\n';

    res += 'FinalShell 4.6\n';
    res += '高级版:' + keccak384(code + 'csSf5*xlkgYSX,y').slice(12, 28) + '\n';
    res += '专业版:' + keccak384(code + 'Scfg*ZkvJZc,s,Y').slice(12, 28) + '\n';

    setOutput('finalshellOutput', res);
    document.getElementById('finalshellResult').style.display = 'block';
}

function clearFinalShell() {
    document.getElementById('machineCode').value = '';
    document.getElementById('finalshellResult').style.display = 'none';
}
