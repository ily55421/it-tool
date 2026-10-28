// 按真实用户路径验证 PDF 合并：进入合并页 -> 拖拽上传 -> 检查按钮可用 -> 合并
import fs from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find((t) => t.type === 'page' && !/^(edge|devtools):\/\//.test(t.url));
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

// 1. 回到应用中心（PDF 分区），再按真实路径进入 PDF 合并页
await ev(`fetch('/cleanup',{method:'POST'}).then(()=>1)`);
await ev(`window.location.hash='#/apps?cat=pdf'`);
await sleep(900);
await ev(`window.location.hash='#/pdf-merge'`);
await sleep(1200);

// 2. 拖拽两个 PDF
const drop = (b64, name) => `(async () => {
  const bin = atob('${b64}');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], '${name}', { type: 'application/pdf' }));
  const target = document.querySelector('.pm-page') || document.body;
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  return true;
})()`;

const pdf1 = fs.readFileSync('testdata/page1.pdf').toString('base64');
const pdf2 = fs.readFileSync('testdata/page2.pdf').toString('base64');

await ev(drop(pdf1, 'one.pdf'));
await sleep(600);
await ev(drop(pdf2, 'two.pdf'));
await sleep(2500);

const state = JSON.parse(
  await ev(`(() => {
    const b = document.getElementById('mergeBtn');
    return JSON.stringify({
      files: document.querySelectorAll('.pm-file-item').length,
      disabled: b.disabled,
      text: b.textContent.trim(),
      toasts: Array.from(document.querySelectorAll('.pm-toast-msg')).map(n => n.textContent)
    });
  })()`)
);
console.log('上传后:', JSON.stringify(state));

if (state.disabled) {
  console.log('FAIL: 按钮仍被禁用');
  ws.close();
  process.exit(1);
}

// 3. 点击合并，确认弹出命名框
await ev(`document.getElementById('mergeBtn').click()`);
await sleep(500);
const modal = JSON.parse(
  await ev(`(() => {
    const m = document.getElementById('pmMergeModal');
    const name = document.getElementById('pmMergeName');
    return JSON.stringify({ hidden: m.classList.contains('hidden'), defaultName: name ? name.value : null });
  })()`)
);
console.log('合并弹窗:', JSON.stringify(modal));

// 4. 执行合并
await ev(`document.getElementById('pmMergeName').value = 'smoke'; document.getElementById('pmMergeConfirm').click()`);
await sleep(2500);
const result = JSON.parse(
  await ev(`(() => {
    const m = document.getElementById('successModal');
    return JSON.stringify({
      successShown: !m.classList.contains('hidden'),
      file: document.getElementById('pmSuccessFile')?.textContent,
      href: document.getElementById('downloadLink')?.getAttribute('href'),
      files: document.querySelectorAll('.pm-file-item').length,
      disabled: document.getElementById('mergeBtn').disabled
    });
  })()`)
);
console.log('合并结果:', JSON.stringify(result));
console.log('页面异常:', problems.length ? JSON.stringify(problems) : '无');
ws.close();
