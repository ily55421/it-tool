use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use pdfium_render::prelude::Pdfium;
use serde::Serialize;

const PDFIUM_DLL: &[u8] = include_bytes!("../vendor/pdfium/bin/pdfium.dll");

#[derive(Clone, Serialize)]
pub struct FileMeta {
    pub id: String,
    pub filename: String,
    pub pages: usize,
    pub size: u64,
}

#[derive(Clone)]
pub struct SplitFile {
    pub filename: String,
    pub kind: String,
    pub path: PathBuf,
}

#[derive(Clone)]
pub struct MdFile {
    pub filename: String,
    pub path: PathBuf,
}

pub struct AppState {
    pub root: PathBuf,
    pub uploads: PathBuf,
    pub outputs: PathBuf,
    pub split_uploads: PathBuf,
    pub split_outputs: PathBuf,
    pub md_uploads: PathBuf,
    pub md_outputs: PathBuf,
    pub pdfium: Arc<Pdfium>,
    pub files: Arc<Mutex<Vec<FileMeta>>>,
    pub split_files: Arc<Mutex<HashMap<String, SplitFile>>>,
    pub md_files: Arc<Mutex<HashMap<String, MdFile>>>,
    /// 界面偏好（如最近使用）。WebView2 的 localStorage 按源隔离，而本服务端口
    /// 每次启动都是随机的，所以客户端存储跨重启一定会丢，必须落到这里。
    pub settings_path: PathBuf,
    pub settings: Arc<Mutex<serde_json::Value>>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        AppState {
            root: self.root.clone(),
            uploads: self.uploads.clone(),
            outputs: self.outputs.clone(),
            split_uploads: self.split_uploads.clone(),
            split_outputs: self.split_outputs.clone(),
            md_uploads: self.md_uploads.clone(),
            md_outputs: self.md_outputs.clone(),
            pdfium: self.pdfium.clone(),
            files: self.files.clone(),
            split_files: self.split_files.clone(),
            md_files: self.md_files.clone(),
            settings_path: self.settings_path.clone(),
            settings: self.settings.clone(),
        }
    }
}

fn load_settings(path: &PathBuf) -> serde_json::Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

pub fn app_data_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("pdfmer")
}

fn init_pdfium(dir: &PathBuf) -> Result<Pdfium, String> {
    fs::create_dir_all(dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    let dll = dir.join("pdfium.dll");
    let needs_write = fs::metadata(&dll)
        .map(|m| m.len() != PDFIUM_DLL.len() as u64)
        .unwrap_or(true);
    if needs_write {
        fs::write(&dll, PDFIUM_DLL).map_err(|e| format!("无法写入 pdfium.dll: {e}"))?;
    }
    let bindings = Pdfium::bind_to_library(&dll)
        .map_err(|e| format!("无法加载 pdfium.dll: {e}"))?;
    Ok(Pdfium::new(bindings))
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let base = app_data_dir();
        fs::create_dir_all(&base).map_err(|e| format!("无法创建数据目录: {e}"))?;

        let pdfium = init_pdfium(&base)?;

        let root = base.join("work");
        let _ = fs::remove_dir_all(&root);
        let uploads = root.join("uploads");
        let outputs = root.join("outputs");
        let split_uploads = root.join("split_uploads");
        let split_outputs = root.join("split_outputs");
        let md_uploads = root.join("md_uploads");
        let md_outputs = root.join("md_outputs");
        for dir in [
            &uploads,
            &outputs,
            &split_uploads,
            &split_outputs,
            &md_uploads,
            &md_outputs,
        ] {
            fs::create_dir_all(dir).map_err(|e| format!("无法创建临时目录: {e}"))?;
        }

        let settings_path = base.join("settings.json");

        Ok(AppState {
            root,
            uploads,
            outputs,
            split_uploads,
            split_outputs,
            md_uploads,
            md_outputs,
            pdfium: Arc::new(pdfium),
            files: Arc::new(Mutex::new(Vec::new())),
            split_files: Arc::new(Mutex::new(HashMap::new())),
            md_files: Arc::new(Mutex::new(HashMap::new())),
            settings: Arc::new(Mutex::new(load_settings(&settings_path))),
            settings_path,
        })
    }

    /// 合并写入界面偏好：只接受对象顶层键，整体落盘一次。
    pub fn update_settings(&self, patch: &serde_json::Value) -> Result<serde_json::Value, String> {
        let mut merged = self
            .settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        let object = merged
            .as_object_mut()
            .ok_or_else(|| "设置根节点不是对象".to_string())?;
        if let Some(entries) = patch.as_object() {
            for (key, value) in entries {
                object.insert(key.clone(), value.clone());
            }
        }
        let text = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
        fs::write(&self.settings_path, text).map_err(|e| format!("无法写入设置: {e}"))?;
        if let Ok(mut current) = self.settings.lock() {
            *current = merged.clone();
        }
        Ok(merged)
    }

    pub fn read_settings(&self) -> serde_json::Value {
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

pub fn format_size(size_bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let n = size_bytes as f64;
    if size_bytes < 1024 {
        format!("{size_bytes} B")
    } else if n < MB {
        format!("{:.2} KB", n / KB)
    } else if n < GB {
        format!("{:.2} MB", n / MB)
    } else {
        format!("{:.2} GB", n / GB)
    }
}

pub fn sanitize_filename(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(name)
        .trim()
        .trim_matches('.');
    let mut out = String::with_capacity(base.len());
    for ch in base.chars() {
        if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        "file".to_string()
    } else {
        out
    }
}

pub fn unique_name(original: &str) -> String {
    format!("{}_{}", uuid::Uuid::new_v4(), sanitize_filename(original))
}

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && !id.contains(['/', '\\'])
        && id != "."
        && id != ".."
        && !id.contains("..")
}
