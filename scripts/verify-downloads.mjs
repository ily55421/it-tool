// 全站下载审计：逐个工具页造出真实产物，再用真实鼠标事件点掉页面上每一个
// 「下载 / 导出 / 保存」控件，断言每个控件都真的触发了下载并落盘。
//
// 为什么必须实测：WebView2 里下载没有任何界面反馈，坏掉的链接（例如被 wry 吞掉的
// target="_blank"）和正常的链接在屏幕上长得一模一样，只有 CDP 的 downloadWillBegin
// 与磁盘上的文件能区分二者。
//
// 前置：启动客户端时打开 CDP 端口
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
//   .\target\release\pdfmer.exe
// 然后：node scripts/verify-downloads.mjs            （全部）
//       node scripts/verify-downloads.mjs gif qrcode （只跑路由含该字样的页）
//
// 退出码：全部通过 0，否则 1。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP = process.env.IT_TOOLS_CDP || 'http://127.0.0.1:9333';
const DL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ittools-dl-'));
const only = process.argv.slice(2);

const targets = await (await fetch(CDP + '/json/list')).json();
// edge://downloads-hub 也算 page 目标（下载过一次就常驻），按 URL 排掉再挑主页面
const page = targets.find((t) => t.type === 'page' && !/^(edge|devtools):\/\//.test(t.url));
if (!page) {
  console.error('找不到页面目标，确认客户端已带 --remote-debugging-port=9333 启动');
  process.exit(2);
}

let id = 0;
const pending = new Map();
let began = [];
let completed = 0;
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Page.downloadWillBegin') {
    began.push(msg.params.suggestedFilename);
  } else if (msg.method === 'Page.downloadProgress' && msg.params.state === 'completed') {
    completed++;
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
const landed = () => (fs.existsSync(DL_DIR) ? fs.readdirSync(DL_DIR).filter((n) => !n.endsWith('.crdownload')) : []);

// 真实鼠标点击：合成 .click() 没有用户激活，处理脚本里的二次 click 会被降级
async function clickAt(x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
}

// 页面上所有可见的下载控件（锚点与按钮都算）
async function findTriggers() {
  const raw = await ev(`
    const nodes = [...document.querySelectorAll('#app a, #app button')].filter((n) => {
      if (!n.offsetParent || n.disabled) return false;
      const t = (n.textContent || '').trim();
      return /下载|导出|保存/.test(t) && t.length <= 40;
    });
    window.__dlTriggers = nodes;
    return JSON.stringify(nodes.map((n) => ({
      tag: n.tagName.toLowerCase(),
      id: n.id || '',
      text: (n.textContent || '').trim(),
      href: n.getAttribute('href')
    })));
  `);
  return typeof raw === 'string' && raw.startsWith('[') ? JSON.parse(raw) : [];
}

async function clickTrigger(i) {
  // 必须先滚进视口：Input.dispatchMouseEvent 用的是视口坐标，
  // 折叠线以下的按钮不滚动就会点到别的东西上（曾误判两个页面下载坏了）
  const raw = await ev(`
    const n = (window.__dlTriggers || [])[${i}];
    if (!n || !n.offsetParent) return 'GONE';
    n.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 240));
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) return 'ZERO';
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  `);
  if (typeof raw !== 'string' || !raw.startsWith('{')) return raw;
  const p = JSON.parse(raw);
  await clickAt(p.x, p.y);
  return 'OK';
}

const b64Maker = (b64) => `
  const bin = atob('${b64}'); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
`;
const feedInput = (inputId, filesExpr) => `
  const dt = new DataTransfer(); dt.items.add(${filesExpr});
  const input = document.getElementById('${inputId}');
  if (!input) return 'NOINPUT ${inputId}';
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'OK';
`;
const PDF_B64 = fs.readFileSync('testdata/page1.pdf').toString('base64');
const PNG = `
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#2f7fe8'; g.fillRect(0, 0, 320, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const pngFile = new File([blob], '微信图片_审计.png', { type: 'image/png' });
`;
const wait = (ms) => `await new Promise((r) => setTimeout(r, ${ms}));`;

/* ---------- 用例：每页先造出真实产物，再点掉所有下载控件 ---------- */
const CASES = [
  {
    r: '/image-to-pdf',
    produce: `${PNG} ${feedInput('fileInput', 'pngFile')}`,
    after: `${wait(1600)} document.getElementById('convertBtn')?.click(); ${wait(2600)} return 'OK';`
  },
  {
    r: '/pdf-merge',
    produce: `${b64Maker(PDF_B64)} ${feedInput('fileInput', `new File([bytes], 'one.pdf', { type: 'application/pdf' })`)}`,
    after: `
      ${wait(2400)}
      const b = document.getElementById('mergeBtn');
      if (!b || b.disabled) return '合并按钮不可用';
      b.click();
      ${wait(700)}
      const n = document.getElementById('pmMergeName'); if (n) n.value = '合并审计';
      document.getElementById('pmMergeConfirm')?.click();
      ${wait(2800)}
      return 'OK';`
  },
  {
    r: '/split-pdf',
    produce: `${b64Maker(PDF_B64)} ${feedInput('fileInput', `new File([bytes], 'p1.pdf', { type: 'application/pdf' })`)}`,
    after: `
      ${wait(2600)}
      document.getElementById('splitBtn')?.click();
      ${wait(3600)}
      return document.querySelectorAll('#fileList a').length + ' 个拆分文件';`
  },
  {
    r: '/md-to-word',
    produce: feedInput('fileInput', `new File(['# 标题\\n\\n正文一段。'], 'demo.md', { type: 'text/markdown' })`),
    after: `
      ${wait(1600)}
      document.getElementById('convertBtn')?.click();
      ${wait(3800)}
      return 'OK';`
  },
  {
    r: '/pdf-to-image',
    produce: `${b64Maker(PDF_B64)} ${feedInput('pdfFileInput', `new File([bytes], 'p1.pdf', { type: 'application/pdf' })`)}`,
    after: `
      ${wait(3000)}
      document.getElementById('convertBtn')?.click();
      ${wait(5000)}
      return 'OK';`
  },
  {
    r: '/image-format',
    produce: `${PNG} ${feedInput('formatFileInput', 'pngFile')}`,
    after: `
      ${wait(1600)}
      document.getElementById('convertBtn')?.click();
      ${wait(3000)}
      return 'OK';`
  },
  {
    r: '/image-idphoto',
    produce: `
      const c = document.createElement('canvas'); c.width = 600; c.height = 800;
      const g = c.getContext('2d'); g.fillStyle = '#dfe6ef'; g.fillRect(0, 0, 600, 800);
      g.fillStyle = '#5b6b7f'; g.beginPath(); g.arc(300, 320, 150, 0, 6.3); g.fill();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      ${feedInput('idphotoFileInput', `new File([blob], 'face.png', { type: 'image/png' })`)}`,
    after: `
      ${wait(1800)}
      document.getElementById('processBtn')?.click();
      ${wait(5000)}
      return 'OK';`
  },
  {
    r: '/gif-tools',
    produce: `
      const mk = async (name, color) => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 120;
        const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 160, 120);
        const b = await new Promise((r) => c.toBlob(r, 'image/png'));
        return new File([b], name, { type: 'image/png' });
      };
      const dt = new DataTransfer();
      dt.items.add(await mk('f1.png', '#2f7fe8'));
      dt.items.add(await mk('f2.png', '#e0447c'));
      const input = document.getElementById('gifFileInput');
      if (!input) return 'NOINPUT gifFileInput';
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'OK';`,
    after: `
      ${wait(1800)}
      document.getElementById('createGifBtn')?.click();
      ${wait(7000)}
      return window.createdGifBlob ? 'OK' : '无 GIF 产物';`
  },
  {
    r: '/qrcode-generate',
    produce: `
      const el = document.getElementById('qrContentInput');
      if (!el) return 'NOINPUT qrContentInput';
      el.value = 'https://example.com/it-tools';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK';`,
    after: `
      document.querySelector('button[onclick*="generateQRCode"]')?.click();
      ${wait(2400)}
      return 'OK';`
  },
  {
    r: '/json-vision',
    produce: `return 'OK';`,
    after: `
      document.querySelector('button[onclick*="jvLoadSample"]')?.click();
      ${wait(3200)}
      return 'OK';`
  },
  {
    r: '/image-processor',
    label: '基础处理 + 九宫格批量下载',
    produce: `${PNG} ${feedInput('imageInput', 'pngFile')}`,
    after: `
      ${wait(2200)}
      document.querySelector('button[onclick*="setMode"][onclick*="grid"]')?.click();
      ${wait(900)}
      return 'OK';`
  }
];

await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Page.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR, eventsEnabled: true });

const report = [];
for (const c of CASES) {
  if (only.length && !only.some((k) => c.r.includes(k))) continue;
  await ev(`window.location.hash='#${c.r}'; return 1;`);
  await sleep(1800);
  const produced = await ev(c.produce);
  const aftered = await ev(c.after || `return 'OK';`);
  const triggers = await findTriggers();
  const rows = [];
  for (let i = 0; i < triggers.length; i++) {
    began = [];
    completed = 0;
    const before = landed().length;
    const clicked = await clickTrigger(i);
    await sleep(3200);
    rows.push({
      trigger: triggers[i],
      clicked,
      names: began.slice(),
      done: completed,
      files: landed().length - before
    });  }
  // 落盘数只作参考：同一个产物重复下载会覆盖同名文件，计数不再增长；
  // 是否真的下载成功以下面两个信号为准。
  const bad = rows.filter((r) => r.done === 0 || !r.names.length);
  report.push({ route: c.r, produced, aftered, triggers: rows, bad });
  console.log(
    `${bad.length ? 'FAIL' : 'PASS'} ${c.r}${c.label ? ' · ' + c.label : ''}  产物=${produced}/${aftered}  下载控件 ${rows.length} 个` +
      (rows.length ? '\n     ' + rows.map((r) => `${r.trigger.text || r.trigger.id}: ${r.done ? 'OK ' + JSON.stringify(r.names) : '无下载(' + r.clicked + ')'}`).join('\n     ') : '')
  );
}

const uuidNamed = landed().filter((n) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(n));
if (uuidNamed.length) console.log('仍带 UUID 前缀的存盘名:', JSON.stringify(uuidNamed));
console.log('落盘合计:', landed().length, '个 →', DL_DIR);
const failed = report.filter((r) => r.bad.length || !r.triggers.length);
console.log(`\n结论：${report.length - failed.length}/${report.length} 个页面的下载控件全部可用`);
if (failed.length) console.log('问题页面:', failed.map((f) => `${f.route}(${f.triggers.length ? f.bad.length + ' 个控件无反应' : '没找到下载控件'})`).join('、'));
ws.close();
process.exit(failed.length || uuidNamed.length ? 1 : 0);
