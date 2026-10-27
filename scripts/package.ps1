param(
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$cargoToml = Join-Path $root 'Cargo.toml'
$dist = Join-Path $root 'dist'
$release = Join-Path $root 'target\release'

function Get-CargoVersion([string]$path) {
    $match = Select-String -Path $path -Pattern '^\s*version\s*=\s*"([^"]+)"' |
        Select-Object -First 1
    if (-not $match) {
        throw "无法从 $path 读取版本号"
    }
    return $match.Matches[0].Groups[1].Value
}

# 版本号以 Cargo.toml 为唯一来源，命令行只用于校验，避免两处不一致。
$cargoVersion = Get-CargoVersion $cargoToml
if ($Version -and $Version -ne $cargoVersion) {
    throw "指定版本 $Version 与 Cargo.toml 中的 $cargoVersion 不一致，请先同步 Cargo.toml"
}
$Version = $cargoVersion

$exe = Join-Path $release 'pdfmer.exe'
$loader = Join-Path $release 'WebView2Loader.dll'
foreach ($required in @($exe, $loader)) {
    if (-not (Test-Path $required)) {
        throw "缺少构建产物：$required。请先运行 cargo build --release"
    }
}

Write-Output "开始打包 IT-Tools v$Version"

# 结束正在运行的客户端，否则复制/写入产物会因文件占用失败。
Get-Process -Name 'IT-Tools', 'pdfmer' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

New-Item -ItemType Directory -Path $dist -Force | Out-Null
$stage = Join-Path $dist "IT-Tools-$Version"
if (Test-Path $stage) {
    Remove-Item $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item $exe (Join-Path $stage 'IT-Tools.exe')
Copy-Item $loader $stage
Set-Content -Path (Join-Path $stage 'version.txt') -Value $Version -Encoding ASCII -NoNewline

$readme = @"
IT-Tools 桌面工具箱 v$Version
===============================

启动方式
--------
双击 IT-Tools.exe 即可打开，无需安装 Python 或浏览器。

系统要求
--------
- Windows 10/11（64 位）
- Microsoft Edge WebView2 运行时（Windows 11 及大部分 Windows 10 已自带）
  如提示缺少 WebView2，请安装：
  https://developer.microsoft.com/microsoft-edge/webview2/

说明
----
- 所有处理都在本机完成，不会上传文件。
- 临时文件保存在 %LOCALAPPDATA%\pdfmer\work，退出后可安全删除。
- 请勿单独移动 IT-Tools.exe，需与 WebView2Loader.dll 放在同一目录。
- 升级方式：直接运行新版本的安装程序覆盖安装即可。
"@
Set-Content -Path (Join-Path $stage 'README.txt') -Value $readme -Encoding UTF8

$zip = Join-Path $dist "IT-Tools-$Version-portable-win64.zip"
if (Test-Path $zip) {
    Remove-Item $zip -Force
}
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal

Write-Output '构建安装程序...'
Push-Location (Join-Path $root 'installer')
try {
    $env:IT_TOOLS_VERSION = $Version
    cargo build --release
} finally {
    Remove-Item Env:\IT_TOOLS_VERSION -ErrorAction SilentlyContinue
    Pop-Location
}
$setup = Join-Path $dist "IT-Tools-$Version-setup-win64.exe"
Copy-Item (Join-Path $root 'installer\target\release\it-tools-setup.exe') $setup -Force

# 发布清单：记录版本、文件名、大小与哈希，便于分发与校验。
$files = @($zip, $setup) | ForEach-Object {
    $item = Get-Item $_
    [ordered]@{
        name   = $item.Name
        size   = $item.Length
        sha256 = (Get-FileHash $item.FullName -Algorithm SHA256).Hash.ToLower()
    }
}
$manifest = [ordered]@{
    product    = 'IT-Tools'
    version    = $Version
    built_at   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    artifacts  = $files
}
$manifestPath = Join-Path $dist "release-$Version.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Remove-Item $stage -Recurse -Force

$zipSize = [math]::Round((Get-Item $zip).Length / 1MB, 2)
$setupSize = [math]::Round((Get-Item $setup).Length / 1MB, 2)
Write-Output "版本：$Version"
Write-Output "便携版：$zip ($zipSize MB)"
Write-Output "安装版：$setup ($setupSize MB)"
Write-Output "清单：  $manifestPath"
