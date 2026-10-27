//! 单文件安装器：把内嵌的 IT-Tools 释放到用户目录，支持覆盖升级与卸载。

use std::ffi::OsStr;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::ptr;

const APP_EXE: &[u8] = include_bytes!("../../target/release/pdfmer.exe");
const WEBVIEW_LOADER: &[u8] = include_bytes!("../../target/release/WebView2Loader.dll");

// 由 scripts/package.ps1 在打包时通过环境变量注入，缺省为开发版本。
const APP_VERSION: &str = match option_env!("IT_TOOLS_VERSION") {
    Some(version) => version,
    None => "0.0.0-dev",
};

const APP_NAME: &str = "IT-Tools";
const SHORTCUT_NAME: &str = "IT-Tools 工具箱.lnk";
const VERSION_FILE: &str = "version.txt";

#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(hwnd: *mut std::ffi::c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
}

fn wide(text: &str) -> Vec<u16> {
    OsStr::new(text)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn message(text: &str, caption: &str) {
    let text = wide(text);
    let caption = wide(caption);
    unsafe {
        MessageBoxW(ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x0000_0040);
    }
}

fn main() {
    let result = if std::env::args().any(|arg| arg == "--uninstall") {
        uninstall()
    } else {
        install()
    };

    if let Err(error) = result {
        message(&format!("操作失败：\n\n{error}"), "IT-Tools 安装程序");
        std::process::exit(1);
    }
}

fn install_dir() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|base| base.join("Programs").join(APP_NAME))
        .ok_or_else(|| "无法定位 LOCALAPPDATA 目录".to_string())
}

fn desktop_dir() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|profile| profile.join("Desktop"))
        .filter(|path| path.is_dir())
        .ok_or_else(|| "无法定位桌面目录".to_string())
}

fn install() -> Result<(), String> {
    let target = install_dir()?;
    std::fs::create_dir_all(&target).map_err(|e| format!("无法创建安装目录: {e}"))?;

    let previous = installed_version(&target);
    stop_running_app(&target);

    let exe_path = target.join("IT-Tools.exe");
    write_file(&exe_path, APP_EXE)?;
    write_file(&target.join("WebView2Loader.dll"), WEBVIEW_LOADER)?;
    write_file(
        &target.join(VERSION_FILE),
        format!("{APP_VERSION}\n").as_bytes(),
    )?;

    let desktop = desktop_dir()?;
    create_shortcut(&desktop.join(SHORTCUT_NAME), &exe_path, &target)?;
    let uninstaller = desktop.join("卸载 IT-Tools.lnk");
    create_shortcut_with_args(&uninstaller, &exe_path, &target, "--uninstall")?;

    let _ = std::process::Command::new(&exe_path).spawn();

    let summary = match previous {
        Some(old) if old != APP_VERSION => {
            format!("IT-Tools 已从 {old} 升级到 {APP_VERSION}。")
        }
        Some(_) => format!("IT-Tools {APP_VERSION} 已重新安装。"),
        None => format!("IT-Tools {APP_VERSION} 已安装完成。"),
    };
    message(
        &format!("{summary}\n\n桌面快捷方式已就绪，程序已启动。"),
        "IT-Tools 安装程序",
    );
    Ok(())
}

fn uninstall() -> Result<(), String> {
    let target = install_dir()?;
    let version = installed_version(&target).unwrap_or_else(|| "未知版本".to_string());
    stop_running_app(&target);

    if let Ok(desktop) = desktop_dir() {
        let _ = std::fs::remove_file(desktop.join(SHORTCUT_NAME));
        let _ = std::fs::remove_file(desktop.join("卸载 IT-Tools.lnk"));
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("无法删除安装目录 {}: {e}", target.display()))?;
    }

    message(
        &format!("IT-Tools {version} 已卸载。"),
        "IT-Tools 安装程序",
    );
    Ok(())
}

fn installed_version(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(dir.join(VERSION_FILE)).ok()?;
    let version = text.trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

/// 升级时必须先结束旧进程，否则可执行文件被占用而写入失败。
fn stop_running_app(dir: &Path) {
    let exe = dir.join("IT-Tools.exe");
    let script = format!(
        "Get-Process -Name 'IT-Tools' -ErrorAction SilentlyContinue | \
         Where-Object {{ $_.Path -eq '{}' }} | \
         Stop-Process -Force; Start-Sleep -Milliseconds 500",
        escape(&exe)
    );
    let _ = hidden_powershell(&script).status();
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file =
        std::fs::File::create(path).map_err(|e| format!("无法写入 {}: {e}", path.display()))?;
    file.write_all(bytes)
        .map_err(|e| format!("无法写入 {}: {e}", path.display()))?;
    Ok(())
}

fn create_shortcut(shortcut: &Path, exe: &Path, workdir: &Path) -> Result<(), String> {
    create_shortcut_with_args(shortcut, exe, workdir, "")
}

fn create_shortcut_with_args(
    shortcut: &Path,
    exe: &Path,
    workdir: &Path,
    args: &str,
) -> Result<(), String> {
    let script = format!(
        "$shell = New-Object -ComObject WScript.Shell; \
         $link = $shell.CreateShortcut('{}'); \
         $link.TargetPath = '{}'; \
         $link.WorkingDirectory = '{}'; \
         $link.Arguments = '{}'; \
         $link.Save()",
        escape(shortcut),
        escape(exe),
        escape(workdir),
        escape_str(args)
    );

    let status = hidden_powershell(&script)
        .status()
        .map_err(|e| format!("无法调用 PowerShell 创建快捷方式: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("创建快捷方式失败: {}", shortcut.display()))
    }
}

fn hidden_powershell(script: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;

    let mut command = std::process::Command::new("powershell");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    command.creation_flags(0x0800_0000);
    command
}

fn escape(path: &Path) -> String {
    escape_str(&path.to_string_lossy())
}

fn escape_str(text: &str) -> String {
    text.replace('\'', "''")
}
