<#
  生成 IT-Tools 应用图标：SVG -> 多尺寸 PNG -> 单文件 ICO。

  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\make-icon.ps1

  产物（覆盖写入）：
    static\img\logo-256.png   256x256，供窗口/任务栏图标（编译期 include_bytes! 内嵌）
    assets\it-tools.ico       16/24/32/48/64/128/256 多尺寸，供 exe 资源图标使用

  依赖：Microsoft Edge（headless 渲染 SVG，保证图标与界面 logo 视觉一致）。

  实现说明：Edge 在很小的窗口尺寸下渲染不稳定（128 会截出空图、256 会放大），
  因此只渲染一张 512x512 母图，再用 GDI+ 逐级折半缩放到各尺寸，保证结果可复现。
#>
[CmdletBinding()]
param(
    [string]$SvgPath,
    [string]$IcoPath,
    [string]$PngPath,
    [int[]]$Sizes = @(16, 24, 32, 48, 64, 128, 256)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot

# Windows PowerShell 5.1 在绑定 param 默认值阶段还没有 $PSScriptRoot，默认路径改在这里补
if (-not $SvgPath) { $SvgPath = Join-Path $projectRoot 'static\img\logo.svg' }
if (-not $IcoPath) { $IcoPath = Join-Path $projectRoot 'assets\it-tools.ico' }
if (-not $PngPath) { $PngPath = Join-Path $projectRoot 'static\img\logo-256.png' }

function Find-Edge {
    $roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles, $env:LOCALAPPDATA)
    foreach ($root in $roots) {
        if (-not $root) { continue }
        $candidate = Join-Path $root 'Microsoft\Edge\Application\msedge.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw '未找到 msedge.exe，无法把 SVG 渲染成位图。'
}

function Resolve-OutputPath([string]$path) {
    $clean = $path -replace '^[.][\\/]', ''
    if ([System.IO.Path]::IsPathRooted($clean)) { return $clean }
    return (Join-Path $projectRoot $clean)
}

function New-ScaledBitmap([System.Drawing.Bitmap]$source, [int]$size) {
    $current = $source
    $owned = $false
    # 逐级折半，避免 512 -> 16 直接双三次缩放导致的糊边
    while ($current.Width -gt $size * 2) {
        $next = New-Object System.Drawing.Bitmap([int]($current.Width / 2), [int]($current.Height / 2), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($next)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.DrawImage($current, (New-Object System.Drawing.Rectangle(0, 0, $next.Width, $next.Height)))
        } finally {
            $g.Dispose()
        }
        if ($owned) { $current.Dispose() }
        $current = $next
        $owned = $true
    }

    $result = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($result)
    try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($current, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
    } finally {
        $g.Dispose()
        if ($owned) { $current.Dispose() }
    }
    return $result
}

$edge = Find-Edge
$svg = (Resolve-Path -LiteralPath $SvgPath).Path
$svgUri = ([System.Uri]$svg).AbsoluteUri

# 渲染中间文件放在工作区 Temp 内，脚本结束即清理
$tempRoot = Join-Path $projectRoot 'Temp\icon-build'
if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$sortedSizes = $Sizes | Sort-Object -Unique
$masterSize = 512
$masterPath = Join-Path $tempRoot "master-$masterSize.png"
$rendered = @{}

try {
    $master = $null
    for ($attempt = 1; $attempt -le 3 -and -not $master; $attempt++) {
        if (Test-Path -LiteralPath $masterPath) { Remove-Item -LiteralPath $masterPath -Force }
        $edgeArgs = @(
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            '--no-first-run',
            '--disable-extensions',
            '--default-background-color=00000000',
            '--force-device-scale-factor=1',
            '--run-all-compositor-stages-before-draw',
            '--virtual-time-budget=3000',
            "--user-data-dir=$(Join-Path $tempRoot "profile-$attempt")",
            "--window-size=$masterSize,$masterSize",
            "--screenshot=$masterPath",
            $svgUri
        )
        $null = Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -PassThru -NoNewWindow `
            -RedirectStandardError (Join-Path $tempRoot "edge-$attempt.err") `
            -RedirectStandardOutput (Join-Path $tempRoot "edge-$attempt.out")
        if (-not (Test-Path -LiteralPath $masterPath)) { continue }

        # 校验母图：尺寸、透明通道、圆角外透明、图已绘制完成
        $valid = $false
        $probe = $null
        try {
            $probe = [System.Drawing.Bitmap]::FromFile($masterPath)
            if ($probe.Width -eq $masterSize -and $probe.Height -eq $masterSize -and
                $probe.PixelFormat -eq [System.Drawing.Imaging.PixelFormat]::Format32bppArgb -and
                $probe.GetPixel(0, 0).A -eq 0) {
                $opaque = 0
                $samples = 0
                for ($y = 0; $y -lt $masterSize; $y += 16) {
                    for ($x = 0; $x -lt $masterSize; $x += 16) {
                        $samples++
                        if ($probe.GetPixel($x, $y).A -gt 240) { $opaque++ }
                    }
                }
                $valid = ($opaque / $samples) -ge 0.6
            }
        } catch {
            $valid = $false
        } finally {
            if ($probe) { $probe.Dispose() }
        }
        if (-not $valid) { continue }

        $master = [System.Drawing.Bitmap]::FromFile($masterPath)
    }
    if (-not $master) { throw 'Edge 渲染母图失败：连续 3 次未得到有效位图。' }

    try {
        foreach ($size in $sortedSizes) {
            $target = Join-Path $tempRoot "logo-$size.png"
            $bitmap = if ($size -eq $masterSize) { $master } else { New-ScaledBitmap $master $size }
            try {
                $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                if ($size -ne $masterSize) { $bitmap.Dispose() }
            }
            $rendered[$size] = $target
        }
    } finally {
        $master.Dispose()
    }

    # 256 尺寸单独留一份给窗口图标（Rust 端解码 PNG 得到 RGBA）
    $pngTarget = Resolve-OutputPath $PngPath
    New-Item -ItemType Directory -Path (Split-Path -Parent $pngTarget) -Force | Out-Null
    $source = if ($rendered.ContainsKey(256)) { $rendered[256] } else { $rendered[$sortedSizes[-1]] }
    Copy-Item -LiteralPath $source -Destination $pngTarget -Force

    # 打包 ICO：每条 16 字节目录项 + PNG 负载
    $entries = @()
    foreach ($size in $sortedSizes) {
        $entries += [pscustomobject]@{ Size = $size; Data = [System.IO.File]::ReadAllBytes($rendered[$size]) }
    }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    try {
        $bw.Write([uint16]0)                     # 保留位
        $bw.Write([uint16]1)                     # 类型：图标
        $bw.Write([uint16]$entries.Count)        # 图像数量
        $offset = 6 + 16 * $entries.Count
        foreach ($entry in $entries) {
            $dim = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
            $bw.Write([byte]$dim)
            $bw.Write([byte]$dim)
            $bw.Write([byte]0)                   # 调色板数量
            $bw.Write([byte]0)                   # 保留位
            $bw.Write([uint16]1)                 # 颜色平面
            $bw.Write([uint16]32)                # 位深
            $bw.Write([uint32]$entry.Data.Length)
            $bw.Write([uint32]$offset)
            $offset += $entry.Data.Length
        }
        foreach ($entry in $entries) { $bw.Write($entry.Data) }
        $bw.Flush()

        $icoTarget = Resolve-OutputPath $IcoPath
        New-Item -ItemType Directory -Path (Split-Path -Parent $icoTarget) -Force | Out-Null
        [System.IO.File]::WriteAllBytes($icoTarget, $ms.ToArray())
    } finally {
        $bw.Dispose()
        $ms.Dispose()
    }
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ("已生成图标：{0}（尺寸 {1}）" -f (Resolve-OutputPath $IcoPath), ($sortedSizes -join '/'))
Write-Host ("已生成窗口图标 PNG：{0}" -f (Resolve-OutputPath $PngPath))
