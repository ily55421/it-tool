

## Codely Structured Memories

### User

### Feedback

### Project
- [2026-10-25 23:35:15] D:\soft\pdfmer 是 Rust 重写的 Windows 桌面工具箱（tao + wry/WebView2 + axum 内嵌 HTTP 服务），已从原 Python/Flask 版本迁移完成。构建：cargo build --release；打包：powershell -File scripts/package.ps1，产物在 dist/（便携版 zip + 单文件安装器）。安装器是独立 crate（installer/），用 include_bytes! 内嵌主程序。关键约束：GNU 工具链下 webview2-com-sys 只能动态链接 WebView2Loader.dll，必须与 exe 同目录；build.rs 会自动复制，pdfium.dll 则内嵌并在运行时释放到 %LOCALAPPDATA%\pdfmer。打包前必须先结束运行中的 IT-Tools/pdfmer 进程，否则 Copy-Item 会因文件占用失败。
- [2026-10-26 00:26:36] D:\soft\pdfmer 前端约束（2026-10-26 修复"拖拽PDF后合并按钮不可用"时确认）：router.loadScript() 必须保证同一脚本只执行一次（it-tools.js 顶层 const 重复声明会报 SyntaxError），且切换路由时必须调用 window.__pdfMergeCleanup() 再移除 data-route-script 节点——script.js 是 IIFE，把拖拽监听挂在 window 上，只移除 script 节点会导致新旧实例同时响应拖拽，表现为文件已上传但按钮一直禁用。上传页还需在 state.uploading=false 之后再调用 updateActions()。详见 AGENT.md「前端脚本加载约束」。

### Reference

