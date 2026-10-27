# AGENT.md

面向后续维护者（含 AI 代理）的项目约定与发布流程。修改代码或发版前请先读本文件。

## 项目概览

IT-Tools 是 Windows 桌面工具箱：tao + wry/WebView2 承载界面，axum 在 `127.0.0.1` 随机端口提供本地服务，前端资源经 `rust-embed` 编译进可执行文件。原 Python/Flask 版本（`app.py`）已不再使用，仅作参考保留。

| 路径 | 作用 |
| --- | --- |
| `src/main.rs` | 窗口与 WebView2 启动、内嵌服务启动 |
| `src/server.rs` | Axum 路由，对应原 Flask 全部接口 |
| `src/pdf.rs` | lopdf 合并/拆分，pdfium 页面渲染 |
| `src/ebook.rs` | EPUB/MOBI 转 PDF（genpdf + 中文字体） |
| `src/md_docx.rs` | Markdown 转 `.docx`（直接生成 OOXML） |
| `src/tools.rs` | 哈希、HMAC、Fernet、UUID/ULID、JSON/YAML 等 |
| `src/assets.rs` | 内嵌 `static/`、`templates/` |
| `build.rs` | 构建后复制 `WebView2Loader.dll` 到输出目录 |
| `installer/` | 单文件安装器（独立 crate，内嵌主程序） |
| `scripts/package.ps1` | 版本化打包入口 |
| `dist/` | 打包产物（不应提交到版本库） |

## 版本号约定

- **唯一来源**：根目录 `Cargo.toml` 的 `version` 字段，遵循语义化版本 `MAJOR.MINOR.PATCH`。
- 安装器版本从 `Cargo.toml` 读出，通过环境变量 `IT_TOOLS_VERSION` 在编译期注入，并在运行时写入安装目录的 `version.txt`。
- 不要手工修改 `installer/Cargo.toml` 的版本（固定为占位值 `0.0.0`），也不要在代码中硬编码版本号。
- `scripts/package.ps1 -Version X.Y.Z` 只用于校验：与 `Cargo.toml` 不一致时会直接报错，避免产物版本错乱。

版本递增建议：

| 变更类型 | 版本位 |
| --- | --- |
| 不兼容改动（安装路径、数据格式等） | MAJOR |
| 新增功能 | MINOR |
| 缺陷修复、样式调整 | PATCH |

## 发布流程

```powershell
# 1. 修改 Cargo.toml 中的 version
# 2. 构建主程序
cargo build --release
# 3. 打包（会先结束运行中的客户端，再编译安装器）
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

产物（文件名含版本号）：

```
dist/
├── IT-Tools-<版本>-setup-win64.exe        单文件安装程序
├── IT-Tools-<版本>-portable-win64.zip     免安装便携版
└── release-<版本>.json                    发布清单（版本、大小、SHA256）
```

发版前自查：

1. `cargo clippy --release` 无警告。
2. 端到端自测：上传并合并 PDF、图片转 PDF、拆分 PDF、Markdown 转 Word、任一 `/api/*` 接口。
3. `dist/release-<版本>.json` 中的版本号与 `Cargo.toml` 一致。
4. 便携版解压后能直接启动；安装版能在干净目录完成安装。

## 安装与升级机制

- 安装目录：`%LOCALAPPDATA%\Programs\IT-Tools`（当前用户，无需管理员权限）。
- 安装时写入 `IT-Tools.exe`、`WebView2Loader.dll`、`version.txt`，并在桌面创建：
  - `IT-Tools 工具箱.lnk`——启动程序
  - `卸载 IT-Tools.lnk`——带 `--uninstall` 参数调用安装器
- **升级即覆盖安装**：直接运行新版本安装程序。安装器会先读取旧版本号、结束正在运行的进程（否则 exe 被占用导致写入失败）、覆盖写入文件后更新 `version.txt`，并在完成提示中显示"已从 A 升级到 B"。
- 卸载：运行安装器并带 `--uninstall`，删除桌面快捷方式与安装目录。

## 打包注意事项

- 打包脚本运行前必须先退出正在运行的 IT-Tools / pdfmer 进程；脚本内已做自动结束，但手动打包时需注意。
- `WebView2Loader.dll` 必须与主程序同目录：GNU 工具链下 `webview2-com-sys` 只能动态链接该库，缺失会导致程序在进入 `main` 之前静默退出。
- `pdfium.dll` 已内嵌进主程序，首次启动释放到 `%LOCALAPPDATA%\pdfmer`。
- 静态 CRT 由 `.cargo/config.toml` 开启，产物不依赖 `libgcc_s_seh-1.dll` 等运行库。
- 安装器通过 `include_bytes!` 内嵌 `target/release/pdfmer.exe`，因此**必须先构建主程序再打包安装器**（`package.ps1` 已按此顺序执行）。

## 前端脚本加载约束（重要）

`base.html` 只静态加载 4 个脚本（lib-loader / tools-registry / app-center / router，合计约 67 KB），
其余全部由 `router.js` 在渲染该路由时才加载。路由条目因此有两个字段，**执行顺序不同**：

- `componentScript`：定义页面 HTML 模板的文件。在 `app.innerHTML` **之前**加载，
  路由表里写成 `component: () => xxxComponent`，把标识符解析推迟到脚本就位之后。
- `scripts`：页面逻辑脚本。在渲染**之后**执行——它们大多在构造时 `getElementById(...).addEventListener`，
  早于渲染执行会拿到 null 元素（`Cannot read properties of null`）。

由此得到两条硬性规则：

- **路由脚本顶层只能用 `var` / `function`。** 它们每次进入页面都会重新执行，出现 `const`、`let`、
  `class` 会在第二次进入时抛 `SyntaxError: Identifier 'X' has already been declared`，整页失效。
  历史上 qrcode-tool、image-format、split_pdf、md_to_docx、image_to_pdf、json_tool 都踩过。
- **不存在"晚到执行"。** `loadScript` 先 `fetch` 源码、校验 `renderToken` 后再以行内脚本同步执行；
  下载期间若已切走页面，这份脚本直接作废。老写法（注入 `<script src>` + 切换时移除节点）会把
  监听器绑到已废弃的 DOM 上，表现为"文件已上传、按钮却一直禁用"。
- **挂在 `window` / `document.body` 上的监听器必须登记解绑**：挂载时调用 `router.onUnmount(fn)`，
  `handleRoute()` 会在切走前统一执行。反面教材：`image_to_pdf.js` 曾在 body 上绑带
  `stopPropagation` 的拖拽监听且从不移除，导致用户访问过一次「图片转 PDF」后，
  本会话内 PDF 合并页的拖拽彻底失效。
- `base.html` 静态引入的脚本由构造期快照的 `bootScripts` 识别，路由不会重复注入。

上传类页面另有约定：`updateActions()` 必须在 `state.uploading = false` **之后**调用，
否则按钮会按"上传中"被禁用，且之后没有任何时机恢复。

自动化冒烟测试：启动客户端时设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`，
然后依次运行：

- `node scripts/verify-tools.mjs` —— 30 个工具页逐个驱动并断言产物（含一条
  "跑完所有页面后合并页仍能响应真实拖拽"的回归护栏），当前 31/31。
- `node scripts/verify-merge.mjs` —— 进入合并页 → 拖拽上传 → 合并 → 下载。
- `node scripts/verify-console.mjs` —— 重载中心页，断言无未捕获异常、按需加载与差异对比可用。

改动路由表或脚本加载顺序后，这三条必须全绿：只跑功能套件不够，晚执行的逻辑脚本会静默拿到 null 元素。

### 第三方库按需加载

`static/js/lib-loader.js` 提供 `window.ITLibs.load(name)`：pdf.js、jsQR、crypto-js、
Sortable、EXIF、qrcode、gif.js 不再写进 `base.html`，第一次用到时才注入 `<script>`，
避免每次启动都解析几百 KB 用不到的代码。

- 用这些库之前必须先 `await ITLibs.load('pdfjs')`（或 `.then()`），否则会抛
  `ReferenceError: pdfjsLib is not defined`。
- 注入的 `<script>` 不打 `data-route-script`，切换路由不会被 `unloadRouteScripts()` 移除；
  加载过的库留在页面里，重复调用命中缓存的 Promise。
- `pdf.min.js` 的 worker 地址由 loader 的 `after` 回调设置，不要再写回 `base.html`。

## 导航：应用中心（无侧边栏）

界面没有侧边栏，入口只有一个全屏的**应用中心**（`#/apps`，`#/` 与未知路由都回落到它）：

- `static/js/tools-registry.js` 是工具清单的唯一来源：分类（含配色）、每个工具的路由、名称、说明、搜索关键词与 SVG 图标。
- `static/js/app-center.js` 负责渲染图标墙、搜索/分类筛选，顶栏面包屑与窗口标题，以及把各页标题统一成「注册表名称 + 分类色徽标」。
- **新增工具必须同时改三处**：`router.js` 注册路由、`tools-registry.js` 登记条目（route 要和路由一致，否则图标墙里看不到）、工具页内的 `← 返回` 链接指向 `#/apps?cat=<分类id>`。
- 分类筛选走查询串（`#/apps?cat=image`），`Router.getHash()` 会先剥掉 `?` 之后的部分再匹配路由。
- 顶栏高度是 `--bar-h`（54px），`.main-content` 用它做 `padding-top`；整屏高的页面（差异对比、JSON 可视化）要用 `calc(100vh - var(--bar-h))`，写 `100vh` 会多出一屏滚动条。
- 键盘：`Ctrl/⌘+K` 或 `/` 唤起搜索，方向键在图标间移动，`Enter` 打开，`Esc` 清空搜索或在工具页返回中心。
- 「最近使用」分区存在 `localStorage` 的 `it-tools.recent`（最多 8 条），仅在无搜索词、无分类筛选时显示。

## 页面样式统一（ui-pages.css）

- `static/css/ui-pages.css` 是最后一层归一层：页面外壳宽度（窄 940 / 中 1120 / 宽 1280）、页头、按钮、卡片、表单控件都取自这里的变量。**新页面的类名要落进这份选择器清单**，否则又会各写一套样式。
- `diff.css`、`json-vision.css` 用 `--ws-*` 变量集中色板，跟随应用浅色主题；改主题只改变量，别往规则里塞十六进制。
- 页面标题里的 emoji 由 `app-center.js` 统一剥除（h2/h3/按钮的开头 emoji 也会被去掉），新页面直接写纯文本标题即可。
- **不要用 `alert()`**：`app-center.js` 把 `window.alert` 换成了非阻塞 toast（`showAppToast`）。原生对话框会冻结 WebView 的渲染进程，自动化测试也会跟着卡死。

## 自动化自检

- `node scripts/verify-tools.mjs`：走真实界面逐个访问 30 个工具页，填输入 / 投递文件 / 点主按钮，断言结果真的产出（哈希长度、docx 下载链接、二维码位图、GIF 产物等）。支持只跑部分：`node scripts/verify-tools.mjs json-formatter uuid`。
- 该脚本应当 30/30 全绿。GIF 创建依赖 `static/lib/gif.js` + `gif.worker.js`（MIT，按需加载），少了它们 `new GIF` 会直接 ReferenceError。
- 拖拽上传在**同一次会话被反复切换路由后**可能对合成 `DragEvent` 失去响应（`verify-merge.mjs` 会报 `files:0`）；干净会话下正常。功能测试因此改走 `#fileInput` 的 change 路径，两者共用同一套上传逻辑。

## 图标与品牌资源

- `static/img/logo.svg` 是界面 logo（顶栏 + favicon），改它即可换整套标识。
- `scripts/make-icon.ps1` 用 Edge headless 渲染 512 母图，再逐级折半缩放出
  `static/img/logo-256.png`（窗口/任务栏图标，`main.rs` 解码后内嵌）与
  `assets/it-tools.ico`（16/24/32/48/64/128/256，exe 资源图标）。
- `build.rs` 调 `windres` 把 `assets/it-tools.rc` 编进 exe 资源段；缺 `windres` 时只
  `cargo:warning`，构建继续，但资源管理器与桌面快捷方式会退回系统默认图标。
- 标题栏样式在 `main.rs::theme_title_bar()`：Windows 11 直接改标题栏/文字/边框颜色，
  Windows 10 退回沉浸式深色模式；不支持的属性会被系统忽略，不影响启动。

## 第三方库注意

`static/lib/` 下的文件是可直接在浏览器运行的 UMD/IIFE 构建。若更新或新增库，导出必须带环境判断
（`typeof module !== 'undefined' && module.exports`），否则浏览器里会抛
`ReferenceError: module is not defined` 并中断该文件后续初始化。
`diff-match-patch.js` 末尾的导出已按此修正，升级该库时不要覆盖回去。

## 临时文件

运行期中间文件位于 `%LOCALAPPDATA%\pdfmer\work`，每次启动重建，可随时清理。

`diff-match-patch.js` 目前没有任何页面在用（差异对比用的是 `diff.js` 自带的实现），
已从 `base.html` 移除加载；若要重新启用，请通过 `ITLibs.load()` 或显式 `<script>` 引入。

`gif.js` / `gif.worker.js` 取自 `gif.js@0.2.0` 的官方 dist（MIT，<https://github.com/jnordberg/gif.js>），
升级时保持两个文件同版本：worker 路径写死在 `gif-tool-component.js` 的 `/static/lib/gif.worker.js`。
