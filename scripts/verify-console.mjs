// 检查页面加载、按需加载与差异对比工具是否还有异常
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);

let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push((d.exception?.description || d.text || '').split('\n')[0]);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
  return r.result?.result?.value;
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 重新加载页面，捕获加载期异常。先回到应用中心，否则沿用上一个脚本留下的页面，
// 首屏断言会误报（图标墙只存在于中心页）。
await ev(`window.location.hash = '#/apps'; 'ok'`);
await sleep(300);
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(2500);

console.log('页面异常:', problems.length ? JSON.stringify(problems) : '无');


// 首屏必须真的渲染出内容，并且顶栏 logo 与应用中心图标墙都在
console.log(
  '首屏渲染:',
  await ev(`JSON.stringify({
    appNodes: document.getElementById('app').childElementCount,
    logo: !!document.querySelector('.app-bar-logo'),
    tiles: document.querySelectorAll('.ac-tile').length,
    groups: document.querySelectorAll('.ac-group').length,
    favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || ''
  })`)
);
// 首屏不应该再下载 pdf.js / jsQR 这类大库
console.log(
  '首屏按需库状态:',
  await ev(`JSON.stringify({
    loader: typeof ITLibs === 'object',
    pdfjs: typeof pdfjsLib !== 'undefined',
    jsqr: typeof jsQR !== 'undefined',
    scripts: document.scripts.length
  })`)
);

// 静态资源应带 gzip 与 ETag
console.log(
  '静态资源协商:',
  await ev(`fetch('/static/lib/pdf.min.js')
    .then(r => JSON.stringify({
      encoding: r.headers.get('content-encoding'),
      etag: (r.headers.get('etag') || '').length > 0
    }))
    .catch(e => 'ERR ' + e.message)`)
);

// 界面偏好存在本地服务（localStorage 因随机端口跨启动必丢）
console.log(
  '设置接口:',
  await ev(`fetch('/api/settings')
    .then(r => r.ok ? r.json() : 'HTTP ' + r.status)
    .then(v => JSON.stringify({ ok: v !== null && typeof v === 'object', keys: Object.keys(v || {}) }))
    .catch(e => 'ERR ' + e.message)`)
);

// 按需加载确实能把 pdf.js 拉起来
console.log(
  'pdfjs 按需加载:',
  await ev(`ITLibs.load('pdfjs').then(() => JSON.stringify({
    defined: typeof pdfjsLib !== 'undefined',
    worker: pdfjsLib.GlobalWorkerOptions.workerSrc
  })).catch(e => 'ERR ' + e.message)`)
);

// 进入差异对比页做一次实际比较
await ev(`window.location.hash = '#/diff'`);
await sleep(1200);
const diffOk = await ev(`(() => {
  document.getElementById('diffLeft').value = 'hello world\\nsecond line';
  document.getElementById('diffRight').value = 'hello there\\nsecond line';
  diffCompute();
  const area = document.getElementById('diffResultArea');
  return JSON.stringify({
    rendered: area.innerHTML.length > 0,
    removed: area.querySelectorAll('.diff-line.removed').length,
    added: area.querySelectorAll('.diff-line.added').length
  });
})()`);
console.log('差异计算:', diffOk);
console.log('切换后异常:', problems.length ? JSON.stringify(problems) : '无');
ws.close();
