// CSS 结构自检：括号配对 + 检测"选择器未闭合就出现声明"的模式
import fs from 'node:fs';

const dir = 'D:/soft/pdfmer/static/css';
let bad = 0;

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const text = fs.readFileSync(`${dir}/${name}`, 'utf8');
    const open = (text.match(/\{/g) || []).length;
    const close = (text.match(/\}/g) || []).length;
    if (open !== close) {
        console.log(`FAIL ${name}: 括号不配对 { =${open} } =${close}`);
        bad++;
        continue;
    }
    // 逐行状态机：在"选择器区"里遇到 `属性:` 且尚未见 `{`，即为断掉的规则。
    // 需要跟踪圆括号深度：跨行的函数值（如 repeating-linear-gradient(...)）不是选择器。
    const lines = text.split(/\r?\n/);
    let inSelector = false;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
        if (depth < 0) depth = 0;
        if (!line || line.startsWith('/*') || line.startsWith('*') || line.startsWith('@') || line.startsWith('}')) continue;
        if (depth > 0) continue; // 仍在某个多行值内部
        if (line.endsWith('{')) { inSelector = false; continue; }
        if (line.endsWith(',')) { inSelector = true; continue; }
        if (inSelector && /^[a-z-]+\s*:/.test(line)) {
            console.log(`FAIL ${name}:${i + 1} 选择器未闭合就出现声明 -> ${line.slice(0, 40)} (上一行应以 { 或 , 结尾)`);
            bad++;
            inSelector = false;
        }
    }
}
console.log(bad ? `${bad} 处问题` : 'CSS 结构自检通过');
process.exit(bad ? 1 : 0);
