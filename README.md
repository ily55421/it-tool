# IT-Tools 桌面工具箱（Rust 版）

原 Python/Flask 项目的 Rust 重构版本：所有 PDF、图片、电子书与文本工具都在本机完成，打包为可直接双击启动的 Windows 桌面客户端（tao + wry/WebView2）。

## 功能

| 分类 | 功能 |
| --- | --- |
| PDF | 合并、拆分、页面缩略图预览、PDF 转图片 |
| 电子书 | MOBI / EPUB 转 PDF |
| 图片 | 图片转 PDF、旋转预览、格式转换、Exif 查看、证件照、二维码生成/解析、GIF 工具 |
| 文档 | Markdown 转 Word（.docx） |
| 文本 | 文本统计、差异对比 |
| 加密安全 | 哈希、HMAC、Bcrypt、Fernet 加解密、Token 生成、BIP39 助记词 |
| ID | UUID、ULID |
| 其他 | JSON 格式化/序列化/可视化、JSON↔YAML、URL 参数、布尔表达式、Git 备忘 |

## 开发

```powershell
cargo build            # 调试构建
cargo run              # 启动桌面客户端
```

## 打包与发布

版本号以根目录 `Cargo.toml` 的 `version` 为唯一来源。修改版本后执行：

```powershell
cargo build --release
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

产物位于 `dist/`，文件名自动带版本号：

- `IT-Tools-<版本>-setup-win64.exe`：单文件安装程序，安装到 `%LOCALAPPDATA%\Programs\IT-Tools`，创建桌面快捷方式与卸载快捷方式。
- `IT-Tools-<版本>-portable-win64.zip`：免安装便携版，解压后双击 `IT-Tools.exe`。
- `release-<版本>.json`：发布清单，含文件大小与 SHA256。

升级方式：直接运行新版安装程序覆盖安装，安装器会自动结束旧进程并显示升级前后的版本。

完整发版流程与约定见 [AGENT.md](AGENT.md)。

## 实现说明

- `src/main.rs`：窗口（tao）与 WebView2（wry）启动，内嵌 HTTP 服务监听 `127.0.0.1` 随机端口。
- `src/server.rs`：Axum 路由，覆盖原 Flask 全部接口。
- `src/pdf.rs`：基于 lopdf 的合并/拆分，基于 pdfium 的页面渲染。
- `src/ebook.rs`：EPUB 解析与 MOBI 转换，genpdf 生成带中文字体的 PDF。
- `src/md_docx.rs`：pulldown-cmark 解析 Markdown，直接生成 OOXML `.docx`。
- `src/tools.rs`：哈希、HMAC、Fernet、UUID/ULID、JSON/YAML 等纯 Rust 实现。
- `src/assets.rs`：`rust-embed` 把 `static/`、`templates/` 编译进可执行文件，并对文本资源做 gzip + ETag/304 协商。
- `static/js/lib-loader.js`：pdf.js、jsQR、crypto-js 等大库按需加载，首屏只解析应用自身脚本。
- `scripts/make-icon.ps1` + `assets/it-tools.ico`：由 `static/img/logo.svg` 生成窗口图标、exe 资源图标与界面 logo。

## 运行时依赖

- Windows 10/11 64 位。
- Microsoft Edge WebView2 运行时（Windows 11 与多数 Windows 10 已预装）。
- `WebView2Loader.dll` 必须与主程序同目录；`build.rs` 会在构建后自动复制到 `target/release`。
- `pdfium.dll` 已内嵌进主程序，首次启动释放到 `%LOCALAPPDATA%\pdfmer`。

## 临时文件

上传与转换的中间文件位于 `%LOCALAPPDATA%\pdfmer\work`，每次启动会重建该目录。
