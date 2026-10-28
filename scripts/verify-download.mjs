// 下载链路自检：走真实界面（图片转 PDF → 用真实鼠标事件点成功弹窗里的下载按钮），
// 断言下载真的开始并落盘。
//
// 前置：启动客户端时打开 CDP 端口
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
//   .\target\release\pdfmer.exe
// 然后：node scripts/verify-download.mjs
//
// 退出码：全部通过 0，否则 1。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CDP = process.env.IT_TOOLS_CDP || 'http://127.0.0.1:9333';
const DL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ittools-dl-'));

const targets = await (await fetch(CDP + '/json/list')).json();
// 每次下载都会留下一个 edge://downloads-hub 的 page 目标，必须按 URL 排掉，否则会连到它上面
const page = targets.find((t) => t.type === 'page' && !/^(edge|devtools):\/\//.test(t.url));
if (!page) {
  console.error('找不到页面目标，确认客户端已带 --remote-debugging-port=9333 启动');
  process.exit(2);
}

let id = 0;
const pending = new Map();
const downloads = [];
let completed = 0;
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Page.downloadWillBegin') {
    downloads.push(msg.params.suggestedFilename);
  } else if (msg.method === 'Page.downloadProgress' && msg.params.state === 'completed') {
    completed++;
  }};
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

// 真实鼠标点击：合成 .click() 没有用户激活，弹窗拦截会污染结论
async function realClick(elId) {
  const raw = await ev(`const el = document.getElementById('${elId}');
              if (!el) return 'NOEL';
              const r = el.getBoundingClientRect();
              return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width });`);
  if (typeof raw !== 'string' || !raw.startsWith('{')) return 'NOBOX ' + raw;
  const box = JSON.parse(raw);
  if (!box.w) return 'HIDDEN ' + elId;
  const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
  return 'OK';
}

const landed = () => (fs.existsSync(DL_DIR) ? fs.readdirSync(DL_DIR).filter((n) => !n.endsWith('.crdownload')) : []);

async function anchorInfo() {
  return JSON.parse(
    await ev(`const a = document.getElementById('downloadLink');
              return JSON.stringify(a ? { target: a.getAttribute('target'), download: a.hasAttribute('download'), href: (a.getAttribute('href') || '').slice(0, 24) } : {});`)
  );
}

await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Page.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR, eventsEnabled: true });

const results = [];

/* ---------- 1. 图片转 PDF ---------- */
await ev(`window.location.hash='#/image-to-pdf'; return 1;`);
await sleep(1400);
await ev(`
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#2f7fe8'; x.fillRect(0, 0, 320, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], '微信图片_测试.png', { type: 'image/png' }));
  const input = document.getElementById('fileInput');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'OK';
`);
await sleep(1600);
await ev(`document.getElementById('convertBtn').click(); return 1;`);
await sleep(2200);
const infoImage = await anchorInfo();
downloads.length = 0;
completed = 0;
let before = landed().length;
console.log('图片转 PDF 锚点:', JSON.stringify(infoImage), '真实点击:', await realClick('downloadLink'));
await sleep(3000);
const toast = await ev(`return Array.from(document.querySelectorAll('.app-toast')).map(n => n.textContent).join(' | ');`);
console.log('点击后 toast:', JSON.stringify(toast));
results.push({ name: '图片转 PDF', events: downloads.length, done: completed, files: landed().length - before, anchor: infoImage, toast: String(toast), names: downloads.slice() });

/* ---------- 2. PDF 合并（对照：这条一直是 plain anchor） ---------- */
await ev(`window.location.hash='#/pdf-merge'; return 1;`);
await sleep(1200);
const pdf = fs.readFileSync('testdata/page1.pdf').toString('base64');
await ev(`
  const bin = atob('${pdf}');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], 'one.pdf', { type: 'application/pdf' }));
  const input = document.getElementById('fileInput');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'OK';
`);
await sleep(2400);
await ev(`document.getElementById('mergeBtn').click(); return 1;`);
await sleep(700);
await ev(`
  const name = document.getElementById('pmMergeName');
  if (name) name.value = '合并测试';
  document.getElementById('pmMergeConfirm')?.click();
  return 1;
`);
await sleep(2600);
const infoMerge = await anchorInfo();
downloads.length = 0;
completed = 0;
before = landed().length;
console.log('PDF 合并锚点:', JSON.stringify(infoMerge), '真实点击:', await realClick('downloadLink'));
await sleep(3000);
results.push({ name: 'PDF 合并', events: downloads.length, done: completed, files: landed().length - before, anchor: infoMerge, names: downloads.slice() });

console.log('下载目录:', DL_DIR, JSON.stringify(landed()));
let ok = true;
for (const r of results) {
  const noUuid = r.names.every((n) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(n));
  const pass =
    r.events > 0 && r.done > 0 && r.files > 0 && noUuid && r.anchor.target !== '_blank' &&
    (r.toast === undefined || r.toast.includes('下载'));
  if (!pass) ok = false;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${r.name}: downloadWillBegin ${r.events} 次 / 完成 ${r.done} 次，落盘 ${r.files} 个，存为名=${JSON.stringify(r.names)}，target=${JSON.stringify(r.anchor.target)}，toast=${JSON.stringify(r.toast || '')}`
  );
}
ws.close();
process.exit(ok ? 0 : 1);
