use std::path::PathBuf;
use std::process::Command;

fn main() {
    embed_icon();
    copy_webview2_loader();
}

/// 把 assets/it-tools.ico 编译进可执行文件的资源段：资源管理器、任务栏、
/// 桌面快捷方式显示的都是这个图标。缺 windres（或非 Windows 目标）时只告警，
/// 不让构建失败——图标属于锦上添花，不该挡住编译。
fn embed_icon() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    println!("cargo:rerun-if-changed=assets/it-tools.rc");
    println!("cargo:rerun-if-changed=assets/it-tools.ico");

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let rc_file = manifest_dir.join("assets/it-tools.rc");
    if !rc_file.is_file() || !manifest_dir.join("assets/it-tools.ico").is_file() {
        return;
    }

    let Ok(out_dir) = std::env::var("OUT_DIR") else {
        return;
    };
    let object = PathBuf::from(out_dir).join("it-tools-icon.o");
    let windres = std::env::var("WINDRES").unwrap_or_else(|_| "windres".to_string());

    let result = Command::new(&windres)
        .arg("-I")
        .arg(manifest_dir.join("assets"))
        .arg("-i")
        .arg(&rc_file)
        .arg("-O")
        .arg("coff")
        .arg("-o")
        .arg(&object)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            println!("cargo:rustc-link-arg={}", object.display());
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("cargo:warning=windres 编译图标资源失败，将使用默认图标: {stderr}");
        }
        Err(error) => {
            println!("cargo:warning=未找到 windres（{error}），跳过 exe 图标嵌入");
        }
    }
}

fn copy_webview2_loader() {
    println!("cargo:rerun-if-changed=vendor/webview2/WebView2Loader.dll");

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest_dir.join("vendor/webview2/WebView2Loader.dll");
    if !source.is_file() {
        return;
    }

    let out_dir = match std::env::var("OUT_DIR") {
        Ok(dir) => PathBuf::from(dir),
        Err(_) => return,
    };
    // OUT_DIR is <target>/<profile>/build/<pkg>-<hash>/out
    let Some(profile_dir) = out_dir.ancestors().nth(3) else {
        return;
    };
    let target = profile_dir.join("WebView2Loader.dll");

    if let Err(error) = std::fs::copy(&source, &target) {
        println!("cargo:warning=无法复制 WebView2Loader.dll: {error}");
    }
}
