// 逐工具功能自检：走真实界面（填输入 / 投递文件 / 点按钮），断言结果真的出来了。
//
// 前置：启动客户端时打开 CDP 端口
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
//   .\target\release\pdfmer.exe
// 然后：node scripts/verify-tools.mjs            （全部 30 个）
//       node scripts/verify-tools.mjs /uuid /diff （只跑指定路由）
//
// 退出码：全部通过 0，否则 1。

import fs from 'node:fs';

const CDP = process.env.IT_TOOLS_CDP || 'http://127.0.0.1:9333';
// 支持带或不带前导斜杠（Git Bash 会改写以 / 开头的参数）：
//   node scripts/verify-tools.mjs json-formatter uuid
const only = process.argv.slice(2).map((a) => (a.startsWith('/') ? a : '/' + a));

const targets = await (await fetch(CDP + '/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('找不到页面目标，确认客户端已带 --remote-debugging-port=9333 启动');
  process.exit(2);
}

let id = 0;
const pending = new Map();
const exceptions = [];
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push((d.exception?.description || d.text || '').split('\n')[0]);
  } else if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
    exceptions.push(msg.params.message.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const ev = async (body) => {
  const r = await send('Runtime.evaluate', {
    expression: '(async () => { ' + body + ' })()',
    awaitPromise: true,
    returnByValue: true
  });
  if (r.result?.exceptionDetails) {
    return 'THROW ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || '').split('\n')[0];
  }
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
// 万一还有原生对话框，自动关掉并记下来（它会冻结渲染进程）
await send('Page.enable');
const dialogs = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Page.javascriptDialogOpening') {
    dialogs.push(msg.params.message);
    send('Page.handleJavaScriptDialog', { accept: true });
  }
});

/* ---------- 页面内工具函数 ---------- */
const PDF = fs.readFileSync('testdata/page1.pdf').toString('base64');
await ev(`window.__T = {
  file(b64, name, type) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type });
  },
  png(name, w, h, color) {
    const c = document.createElement('canvas');
    c.width = w || 320; c.height = h || 200;
    const x = c.getContext('2d');
    x.fillStyle = color || '#2f7fe8'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#ffffff'; x.fillRect(24, 24, 96, 64);
    return fetch(c.toDataURL('image/png')).then((r) => r.blob()).then((b) => new File([b], name, { type: 'image/png' }));
  },
  setFiles(inputId, files) {
    const input = document.getElementById(inputId);
    if (!input) return 'NOINPUT ' + inputId;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'OK';
  },
  drop(target, files) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return 'NO TARGET ' + target;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    ['dragenter', 'dragover'].forEach((t) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return 'OK';
  },
  clickText(text) {
    const btn = [...document.querySelectorAll('#app button, #app a.btn')].find((n) => n.textContent.replace(/\\s+/g, '').includes(text.replace(/\\s+/g, '')));
    if (!btn) return 'NOBTN ' + text;
    btn.click();
    return 'OK';
  },
  // 按 onclick 精确点按钮：页面上常有同名标签页按钮（如"生成二维码"既是标签也是动作）
  clickSel(css) {
    const btn = document.querySelector(css);
    if (!btn) return 'NOBTN ' + css;
    btn.click();
    return 'OK';
  },
  val(elId) { const el = document.getElementById(elId); return el ? (el.value || '').trim() : 'NOEL'; },
  txt(elId) { const el = document.getElementById(elId); return el ? el.textContent.trim() : 'NOEL'; },
  shown(elId) { const el = document.getElementById(elId); return !!el && el.offsetParent !== null; },
  media() { return [...document.querySelectorAll('#app img, #app canvas')].filter((n) => (n.tagName === 'IMG' && /^(blob:|data:)/.test(n.src)) || (n.tagName === 'CANVAS' && n.width > 0)).length; },
  ok(cond, info) { return JSON.stringify({ ok: !!cond, info: String(info) }); },
  // 轮询到条件成立为止：上传 / 缩略图渲染是异步的，固定等待会偶发漏判
  async until(expr, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    for (;;) {
      // eslint-disable-next-line no-new-func
      if (new Function('return (' + expr + ')')()) return true;
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}`);
await ev(`window.__T.PDF_B64 = '${PDF}';`);
await ev(`window.__T.PDF2_B64 = '${fs.readFileSync('testdata/merged.pdf').toString('base64')}';`);

/* ---------- 用例 ---------- */
// act：驱动页面；check：断言。都写成字符串，交给页面执行并返回 __T.ok(...)
const CASES = [
  {
    r: '/pdf-merge',
    ready: "typeof window.__pdfMergeCleanup === 'function' && !!document.getElementById('uploadArea')",
    act: `// 走 #fileInput 的 change 路径：与拖拽共用同一套上传/渲染逻辑，但不依赖合成 DragEvent
          __T.setFiles('fileInput', [__T.file(__T.PDF_B64, 'p1.pdf', 'application/pdf')]);
          await new Promise((r) => setTimeout(r, 2200));
          __T.setFiles('fileInput', [__T.file(__T.PDF2_B64, 'p2.pdf', 'application/pdf')]);
          return 'OK';`,
    wait: 400,
    check: `const ready = await __T.until("!!document.getElementById('mergeBtn') && !document.getElementById('mergeBtn').disabled", 10000);
            return __T.ok(ready && __T.txt('fileCount') === '(2)', '文件数 ' + __T.txt('fileCount') + '，合并按钮 ' + (ready ? '可点' : '仍禁用'));`
  },
  {
    r: '/split-pdf',
    act: `return __T.drop('#uploadArea', [__T.file(__T.PDF_B64, 'p1.pdf', 'application/pdf')]);`,
    wait: 2200,
    check: `return __T.ok(__T.shown('fileInfo') && __T.txt('totalPages') !== 'NOEL', '页数 ' + __T.txt('totalPages') + '，拆分区 ' + (__T.shown('splitSection') ? '可见' : '隐藏'));`
  },
  {
    // 上传 → 编辑 → 转换要在同一次页面实例里跑完，中途切换路由会丢掉进行中的请求
    r: '/md-to-word',
    act: `const md = new File(['# 测试标题\\n\\n正文一段内容。\\n\\n- 列表项\\n'], 'demo.md', { type: 'text/markdown' });
          __T.drop('#uploadArea', [md]);
          await new Promise((r) => setTimeout(r, 1200));
          if (!__T.shown('editorSection')) return '编辑区未出现';
          __T.clickSel('#convertBtn');
          await new Promise((r) => setTimeout(r, 3600));
          return 'OK';`,
    wait: 200,
    check: `const link = document.getElementById('downloadLink');
            const href = link ? (link.getAttribute('href') || '') : '';
            return __T.ok(/md-download/.test(href) && __T.shown('resultSection'),
              '生成 ' + __T.txt('resultFileName') + ' / ' + __T.txt('resultFileSize') + '，链接 ' + href.slice(0, 34));`
  },
  {
    r: '/image-processor',
    act: `return __T.setFiles('imageInput', [await __T.png('pic.png')]);`,
    wait: 1400,
    check: `const img = document.getElementById('originalImage');
            return __T.ok(img && img.src && img.src.length > 20 && __T.media() > 0, '原图 ' + (img ? (img.naturalWidth || img.width) + 'px' : '无') + '，画面元素 ' + __T.media());`
  },
  {
    r: '/image-format',
    act: `return __T.setFiles('formatFileInput', [await __T.png('pic.png')]);`,
    wait: 1400,
    check: `const info = document.getElementById('formatImageInfo');
            const btn = document.getElementById('convertBtn');
            return __T.ok(__T.media() > 0 && btn && !btn.disabled, '预览 ' + __T.media() + ' 个，转换按钮 ' + (btn && !btn.disabled ? '可点' : '禁用'));`
  },
  {
    r: '/image-exif',
    act: `const png = await __T.png('pic.png');
          const c = document.createElement('canvas'); c.width = 200; c.height = 120;
          c.getContext('2d').drawImage(await createImageBitmap(png), 0, 0);
          const jpg = await fetch(c.toDataURL('image/jpeg', 0.9)).then(r => r.blob());
          return __T.setFiles('exifFileInput', [new File([jpg], 'pic.jpg', { type: 'image/jpeg' })]);`,
    wait: 1500,
    check: `const rows = document.querySelectorAll('#exifContent .info-row, #exifContent > *').length;
            return __T.ok(__T.media() > 0 && rows > 0, '预览 ' + __T.media() + '，Exif 行 ' + rows);`
  },
  {
    r: '/image-idphoto',
    act: `return __T.setFiles('idphotoFileInput', [await __T.png('face.png', 600, 800)]);`,
    wait: 1600,
    check: `return __T.ok(__T.media() > 0 && __T.txt('idphotoInfo') !== 'NOEL', '预览 ' + __T.media() + '，信息 ' + __T.txt('idphotoInfo').slice(0, 40));`
  },
  {
    r: '/qrcode-generate',
    act: `const el = document.getElementById('qrContentInput');
          if (!el) return 'NOINPUT';
          el.value = 'https://example.com/it-tools';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickSel('button[onclick*="generateQRCode"]');`,
    wait: 1800,
    check: `const canvas = document.querySelector('#qrPreviewArea canvas, #qrPreviewArea img');
            window.__qrData = canvas && canvas.toDataURL ? canvas.toDataURL() : (canvas && canvas.src && canvas.src.startsWith('data:') ? canvas.src : '');
            return __T.ok(!!window.__qrData && window.__qrData.length > 2000, '二维码位图 ' + Math.round((window.__qrData || '').length / 1024) + ' KB base64');`
  },
  {
    r: '/qrcode-parse',
    act: `const data = window.__qrData;
          if (!data) return 'NO QR DATA';
          const blob = await fetch(data).then(r => r.blob());
          return __T.setFiles('qrFileInput', [new File([blob], 'qr.png', { type: 'image/png' })]);`,
    wait: 2000,
    check: `const out = __T.txt('qrResultText') || __T.val('qrResultText');
            return __T.ok(/example\\.com/.test(out), '解析结果 ' + String(out).slice(0, 60));`
  },
  {
    r: '/gif-tools',
    act: `return __T.setFiles('gifFileInput', [await __T.png('f1.png', 160, 120, '#2f7fe8'), await __T.png('f2.png', 160, 120, '#e0447c')]);`,
    wait: 1400,
    check: `const frames = document.querySelectorAll('#gifImageList > *, #framesList > *').length;
            const btn = document.getElementById('createGifBtn');
            if (btn) btn.click();
            await new Promise((r) => setTimeout(r, 4000));
            const blob = window.createdGifBlob;
            const dl = document.getElementById('gifDownloadArea');
            return __T.ok(frames >= 2 && !!blob && dl && dl.offsetParent !== null,
              '帧 ' + frames + '，GIF 产物 ' + (blob ? blob.size + ' 字节' : '无（缺 static/lib/gif.js 与 gif.worker.js）'));`
  },
  {
    r: '/pdf-to-image',
    act: `return __T.setFiles('pdfFileInput', [__T.file(__T.PDF_B64, 'p1.pdf', 'application/pdf')]);`,
    wait: 3000,
    check: `const pages = document.querySelectorAll('#pagesList > *').length;
            return __T.ok(pages > 0 && __T.media() > 0, '页卡 ' + pages + '，缩略图 ' + __T.media());`
  },
  {
    r: '/image-to-pdf',
    act: `return __T.setFiles('fileInput', [await __T.png('scan.png')]);`,
    wait: 1600,
    check: `return __T.ok(__T.media() > 0 && __T.shown('rotationControls'), '预览 ' + __T.media() + '，旋转控件 ' + (__T.shown('rotationControls') ? '可见' : '隐藏'));`
  },
  {
    r: '/text-stats',
    act: `const el = document.getElementById('statsInput'); el.value = 'hello 世界\\nsecond line';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('分析统计');`,
    wait: 1400,
    check: `return __T.ok(__T.shown('statsResult') && +__T.txt('charCount') > 10, '字符数 ' + __T.txt('charCount') + '，行数 ' + __T.txt('lineCount'));`
  },
  {
    r: '/hash-text',
    act: `const el = document.getElementById('hashInput'); el.value = 'it-tools';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('生成哈希');`,
    wait: 1400,
    check: `const out = __T.txt('hashOutput');
            return __T.ok(/^[0-9a-f]{64}$/.test(out), 'SHA256 ' + out.slice(0, 16) + '…（' + out.length + ' 位）');`
  },
  {
    r: '/token-gen',
    act: `return __T.clickText('生成Token');`,
    wait: 1400,
    check: `const out = __T.txt('tokenOutput');
            return __T.ok(out.length >= 32, '长度 ' + out.length);`
  },
  {
    r: '/diff',
    act: `document.getElementById('diffLeft').value = 'hello world\\nsecond line';
          document.getElementById('diffRight').value = 'hello there\\nsecond line';
          return __T.clickText('Side-by-Side') || 'x';`,
    wait: 900,
    check: `if (typeof diffCompute === 'function') diffCompute();
            const area = document.getElementById('diffResultArea');
            return __T.ok(area && area.querySelectorAll('.diff-line.removed').length > 0 && area.querySelectorAll('.diff-line.added').length > 0,
              '增 ' + area.querySelectorAll('.diff-line.added').length + ' 删 ' + area.querySelectorAll('.diff-line.removed').length);`
  },
  {
    r: '/json-formatter',
    act: `const el = document.getElementById('jsonInput'); el.value = '{"a":1,"b":[2,3]}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('格式化');`,
    wait: 1200,
    check: `const el = document.getElementById('jsonOutput');
            const text = el ? el.innerText : '';
            return __T.ok(/"a"\\s*:\\s*1/.test(text) && text.split('\\n').length >= 3, '输出 ' + text.replace(/\\s+/g, ' ').slice(0, 40) + '（' + text.split('\\n').length + ' 行）');`
  },
  {
    r: '/json-vision',
    act: `const el = document.getElementById('jvEditor') || document.querySelector('#app textarea');
          if (!el) return 'NOEDITOR';
          el.value = '{"root":{"child":[1,"two",true,null]}}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('格式化') !== 'NOBTN' ? 'OK' : __T.clickText('自动布局');`,
    wait: 1800,
    check: `const nodes = document.querySelectorAll('.jv-node').length;
            return __T.ok(nodes > 1, '节点 ' + nodes + ' 个');`
  },
  {
    r: '/json-tool',
    act: `const el = document.getElementById('jsonInput'); el.value = '{"name":"Tom","age":18}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('转换');`,
    wait: 1400,
    check: `const out = __T.txt('jsonOutput');
            return __T.ok(out.includes('Tom') && out.length > 10, '输出 ' + out.replace(/\\s+/g, ' ').slice(0, 40));`
  },
  {
    r: '/json-yaml',
    act: `const el = document.getElementById('convertInput'); el.value = '{"a":1,"b":"x"}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return __T.clickText('转换');`,
    wait: 1500,
    check: `const out = __T.txt('convertOutput');
            return __T.ok(/a:\\s*1/.test(out), 'YAML ' + out.replace(/\\s+/g, ' ').slice(0, 30));`
  },
  {
    r: '/bcrypt',
    act: `document.getElementById('bcryptInput').value = 'secret123';
          return __T.clickText('加密');`,
    wait: 2200,
    check: `const out = __T.txt('bcryptOutput');
            return __T.ok(/^\\$2[aby]?\\$/.test(out), out.slice(0, 12) + '…');`
  },
  {
    r: '/encrypt',
    act: `document.getElementById('encryptInput').value = '需要加密的内容';
          document.getElementById('encryptKey').value = 'key-123';
          return __T.clickSel('button[onclick*="doEncrypt"]');`,
    wait: 1800,
    check: `const out = __T.txt('encryptOutput');
            return __T.ok(out.length > 8, '密文 ' + out.slice(0, 24) + '…');`
  },
  {
    r: '/hmac',
    act: `document.getElementById('hmacInput').value = 'message';
          document.getElementById('hmacKey').value = 'secret';
          return __T.clickText('生成HMAC');`,
    wait: 1600,
    check: `const out = __T.txt('hmacOutput');
            return __T.ok(/^[0-9a-f]{32,}$/.test(out), 'HMAC ' + out.slice(0, 16) + '…');`
  },
  {
    r: '/bip39',
    act: `return __T.clickText('生成');`,
    wait: 1600,
    check: `const out = __T.txt('bip39Output');
            return __T.ok(out.split(/\\s+/).length >= 12, '助记词 ' + out.split(/\\s+/).length + ' 词');`
  },
  {
    r: '/uuid',
    act: `return __T.clickText('生成UUID');`,
    wait: 1600,
    check: `const out = __T.txt('uuidOutput');
            return __T.ok(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(out), out.slice(0, 40));`
  },
  {
    r: '/ulid',
    act: `return __T.clickText('生成ULID');`,
    wait: 1600,
    check: `const out = __T.txt('ulidOutput');
            return __T.ok(/[0-9A-Z]{26}/.test(out), out.slice(0, 30));`
  },
  {
    r: '/git-tools',
    act: `return 'OK';`,
    wait: 500,
    check: `const secs = document.querySelectorAll('.git-section').length;
            const cmds = document.querySelectorAll('.git-command, .git-section code, .git-section pre').length;
            return __T.ok(secs > 2 && cmds > 5, '分组 ' + secs + '，命令条目 ' + cmds);`
  },
  {
    r: '/finalshell',
    act: `document.getElementById('machineCode').value = 'ABCDEF1234567890';
          return __T.clickText('生成授权码');`,
    wait: 1600,
    check: `const out = __T.txt('finalshellOutput');
            return __T.ok(out.length > 16, '授权码输出 ' + out.length + ' 字符');`
  },
  {
    r: '/boolean',
    act: `document.getElementById('booleanInput').value = 'True and not False';
          return __T.clickText('计算');`,
    wait: 1600,
    check: `const out = __T.txt('booleanOutput');
            return __T.ok(/true/i.test(out), '结果 ' + out.slice(0, 40));`
  },
  {
    r: '/url-params',
    act: `document.getElementById('urlInput').value = 'https://e.com/p?a=1&b=%E4%B8%AD';
          return __T.clickText('执行');`,
    wait: 1600,
    check: `const out = __T.txt('urlOutput');
            return __T.ok(out.includes('a') && out.includes('1'), out.replace(/\\s+/g, ' ').slice(0, 50));`
  }
];

const selected = only.length ? CASES.filter((c) => only.includes(c.r)) : CASES;
const routes = [...new Set(selected.map((c) => c.r))];
const pass = [];
const fail = [];

console.log('CDP: ' + page.url);
console.log('用例 ' + selected.length + ' 步，覆盖 ' + routes.length + ' 个工具页\n');

for (const c of selected) {
  await ev(`window.location.hash = '#/apps'; return 1`);
  await sleep(140);
  await ev(`window.location.hash = '#${c.r}'; return 1`);
  // 等到页面挂上、且按需注入的脚本真的执行完，再开始操作
  const ready = c.ready || "!!document.querySelector('#app').firstElementChild";
  await ev(`return await __T.until(${JSON.stringify(ready)}, 6000)`);
  await sleep(260);
  const acted = await ev(c.act);
  if (typeof acted === 'string' && acted.startsWith('THROW')) {
    fail.push([c.r, '操作脚本异常: ' + acted.slice(0, 120)]);
    console.log('FAIL ' + c.r.padEnd(18) + fail[fail.length - 1][1]);
    continue;
  }
  await sleep(c.wait || 800);
  const raw = await ev(c.check);
  let verdict;
  try {
    verdict = JSON.parse(raw);
  } catch {
    verdict = { ok: false, info: '断言返回异常: ' + String(raw).slice(0, 100) };
  }
  (verdict.ok ? pass : fail).push([c.r, verdict.info]);
  console.log((verdict.ok ? 'PASS ' : 'FAIL ') + c.r.padEnd(18) + verdict.info);
}

const pageErrors = [...new Set(exceptions)];
console.log('\n未捕获异常: ' + (pageErrors.length ? '\n  - ' + pageErrors.join('\n  - ') : '无'));
if (dialogs.length) console.log('仍在用原生对话框（会冻结界面）: ' + [...new Set(dialogs)].join(' / '));
console.log('通过 ' + pass.length + ' / ' + selected.length + (fail.length ? '，失败 ' + fail.length : ''));
ws.close();
process.exit(fail.length || pageErrors.length ? 1 : 0);
