use std::collections::HashMap;
use std::io::Write;
use std::sync::{Mutex, OnceLock};

use axum::body::{Body, Bytes};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use flate2::write::GzEncoder;
use flate2::Compression;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "static"]
struct StaticAssets;

#[derive(RustEmbed)]
#[folder = "templates"]
struct TemplateAssets;

/// 资源在编译期就固化进可执行文件，gzip 结果可以长期复用：
/// 首次请求时压缩一次，之后直接命中缓存，省掉每次启动重复压缩数 MB 脚本的开销。
fn gzip_cache() -> &'static Mutex<HashMap<String, Bytes>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Bytes>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn static_response(path: &str, request_headers: &HeaderMap) -> Response {
    match StaticAssets::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            build_response(
                path,
                file.data.as_ref(),
                file.metadata.sha256_hash(),
                mime.as_ref(),
                request_headers,
            )
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

pub fn index_response(request_headers: &HeaderMap) -> Response {
    match TemplateAssets::get("base.html") {
        Some(file) => build_response(
            "base.html",
            file.data.as_ref(),
            file.metadata.sha256_hash(),
            "text/html; charset=utf-8",
            request_headers,
        ),
        None => (StatusCode::INTERNAL_SERVER_ERROR, "base.html is missing").into_response(),
    }
}

/// 统一的资源响应：ETag 协商（内容没变直接 304，不再重传几百 KB 脚本），
/// 文本类资源按需 gzip（1.9 MB 前端脚本压到约 450 KB）。
fn build_response(
    path: &str,
    data: &[u8],
    content_hash: [u8; 32],
    mime: &str,
    request_headers: &HeaderMap,
) -> Response {
    let etag = format!("\"{}\"", to_hex(&content_hash));
    let gzip_ok = accepts_gzip(request_headers);

    if let Some(value) = request_headers.get(header::IF_NONE_MATCH) {
        if value
            .to_str()
            .map(|text| text.split(',').any(|item| item.trim() == etag))
            .unwrap_or(false)
        {
            return (
                StatusCode::NOT_MODIFIED,
                [
                    (header::ETAG, etag),
                    (header::CACHE_CONTROL, "no-cache".to_string()),
                    (header::VARY, "accept-encoding".to_string()),
                ],
            )
                .into_response();
        }
    }

    if gzip_ok && data.len() >= 1024 && is_compressible(mime) {
        let compressed = gzip_once(path, data);
        return (
            [
                (header::CONTENT_TYPE, mime.to_string()),
                (header::CONTENT_ENCODING, "gzip".to_string()),
                (header::CACHE_CONTROL, "no-cache".to_string()),
                (header::ETAG, etag),
                (header::VARY, "accept-encoding".to_string()),
            ],
            Body::from(compressed),
        )
            .into_response();
    }

    (
        [
            (header::CONTENT_TYPE, mime.to_string()),
            (header::CACHE_CONTROL, "no-cache".to_string()),
            (header::ETAG, etag),
            (header::VARY, "accept-encoding".to_string()),
        ],
        Body::from(data.to_vec()),
    )
        .into_response()
}

fn gzip_once(path: &str, data: &[u8]) -> Bytes {
    let cache = gzip_cache();
    if let Some(cached) = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(path)
        .cloned()
    {
        return cached;
    }

    let mut encoder = GzEncoder::new(Vec::with_capacity(data.len() / 3), Compression::new(6));
    let compressed = match encoder.write_all(data).and_then(|_| encoder.finish()) {
        Ok(bytes) => Bytes::from(bytes),
        // 压缩失败（理论上不会发生）时退回原始内容，不让页面直接坏掉
        Err(_) => Bytes::from(data.to_vec()),
    };

    cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(path.to_string(), compressed.clone());
    compressed
}

fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_ascii_lowercase().contains("gzip"))
        .unwrap_or(false)
}

/// 只压文本类资源；png/jpg/woff 本来就压过了，再 gzip 只会浪费 CPU。
fn is_compressible(mime: &str) -> bool {
    mime.starts_with("text/")
        || mime.contains("javascript")
        || mime.contains("json")
        || mime.contains("xml")
        || mime.contains("svg")
        || mime.contains("wasm")
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}
