use std::collections::HashMap;
use std::path::{Path, PathBuf};

use axum::extract::{DefaultBodyLimit, Multipart, Path as AxPath, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::assets;
use crate::ebook;
use crate::image_pdf;
use crate::md_docx;
use crate::pdf;
use crate::state::{format_size, is_safe_id, sanitize_filename, unique_name, AppState, FileMeta, MdFile, SplitFile};
use crate::tools;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/index.html", get(index))
        .route("/tools", get(index))
        .route("/json-tool", get(index))
        .route("/image-to-pdf", get(index))
        .route("/static/{*path}", get(static_file))
        .route("/upload", post(upload))
        .route("/files", get(files))
        .route("/thumbnail/{id}", get(thumbnail))
        .route("/preview-merged", post(preview_merged))
        .route("/merge", post(merge))
        .route("/cleanup", post(cleanup))
        .route("/download/{name}", get(download))
        .route("/preview-image", post(preview_image))
        .route("/convert-image", post(convert_image))
        .route("/json-serialize", post(json_serialize))
        .route("/split-upload", post(split_upload))
        .route("/convert-file", post(convert_file))
        .route("/split-pdf", post(split_pdf))
        .route("/split-download/{file_id}/{filename}", get(split_download))
        .route("/md-upload", post(md_upload))
        .route("/md-convert", post(md_convert))
        .route("/md-download/{folder}/{filename}", get(md_download))
        .route("/api/text-stats", post(api_text_stats))
        .route("/api/hash-text", post(api_hash_text))
        .route("/api/generate-token", post(api_generate_token))
        .route("/api/json-yaml-convert", post(api_json_yaml))
        .route("/api/bcrypt", post(api_bcrypt))
        .route("/api/encrypt", post(api_encrypt))
        .route("/api/hmac", post(api_hmac))
        .route("/api/bip39", post(api_bip39))
        .route("/api/uuid", post(api_uuid))
        .route("/api/ulid", post(api_ulid))
        .route("/api/boolean", post(api_boolean))
        .route("/api/url-params", post(api_url_params))
        .route(
            "/api/settings",
            get(api_settings).post(api_settings_update),
        )
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024))
        .with_state(state)
}

/// 读取界面偏好。WebView2 的 localStorage 按源隔离，而本服务端口每次启动随机，
/// 所以客户端需要跨启动保留的东西（如最近使用）只能存在这里。
async fn api_settings(State(state): State<AppState>) -> Response {
    ok_json(state.read_settings())
}

async fn api_settings_update(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    if body
        .get("recent")
        .and_then(Value::as_array)
        .is_some_and(|list| list.len() > 50)
    {
        return api_error(StatusCode::BAD_REQUEST, "recent 列表过长");
    }
    match state.update_settings(&body) {
        Ok(merged) => ok_json(merged),
        Err(error) => api_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

fn ok_json(value: Value) -> Response {
    Json(value).into_response()
}

fn api_error(status: StatusCode, message: impl Into<String>) -> Response {
    (
        status,
        Json(json!({ "success": false, "error": message.into() })),
    )
        .into_response()
}

fn internal_error(message: impl Into<String>) -> Response {
    api_error(StatusCode::INTERNAL_SERVER_ERROR, message)
}

fn not_found(message: impl Into<String>) -> Response {
    api_error(StatusCode::NOT_FOUND, message)
}

fn meta_json(state: &AppState, meta: &FileMeta) -> Value {
    json!({
        "id": meta.id,
        "filename": meta.filename,
        "path": state.uploads.join(&meta.id).to_string_lossy(),
        "info": {
            "filename": meta.filename,
            "pages": meta.pages,
            "size": meta.size,
        }
    })
}

fn lookup_meta(state: &AppState, id: &str) -> Option<FileMeta> {
    state
        .files
        .lock()
        .unwrap()
        .iter()
        .find(|meta| meta.id == id)
        .cloned()
}

fn lookup_split(state: &AppState, id: &str) -> Option<SplitFile> {
    state.split_files.lock().unwrap().get(id).cloned()
}

fn url_segment(name: &str) -> String {
    percent_encoding::utf8_percent_encode(name, percent_encoding::NON_ALPHANUMERIC).to_string()
}

/// 输出文件名前缀的 UUID 只用于防止同名互相覆盖，不该出现在用户看到的名字里。
fn display_name(stored: &str) -> String {
    match stored.split_once('_') {
        Some((prefix, rest)) if !rest.is_empty() && uuid::Uuid::parse_str(prefix).is_ok() => rest.to_string(),
        _ => stored.to_string(),
    }
}

fn attachment_response(bytes: Vec<u8>, filename: &str, content_type: &str) -> Response {
    let fallback: String = filename
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let encoded = url_segment(filename);
    let disposition = format!("attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}");

    let mut response = (StatusCode::OK, axum::body::Body::from(bytes)).into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    if let Ok(value) = HeaderValue::from_str(&disposition) {
        headers.insert(header::CONTENT_DISPOSITION, value);
    }
    response
}

async fn index(headers: HeaderMap) -> Response {
    assets::index_response(&headers)
}

async fn static_file(AxPath(path): AxPath<String>, headers: HeaderMap) -> Response {
    assets::static_response(&path, &headers)
}

async fn upload(State(state): State<AppState>, mut multipart: Multipart) -> Response {
    let mut uploaded: Vec<Value> = Vec::new();
    let mut rejected: Vec<Value> = Vec::new();

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(error) => return api_error(StatusCode::BAD_REQUEST, format!("上传数据无效: {error}")),
        };
        if field.name() != Some("files") {
            continue;
        }
        let original = field
            .file_name()
            .map(sanitize_filename)
            .unwrap_or_else(|| "file.pdf".to_string());
        if !original.to_ascii_lowercase().ends_with(".pdf") {
            rejected.push(json!({ "filename": original }));
            continue;
        }
        let bytes = match field.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => return api_error(StatusCode::BAD_REQUEST, format!("读取上传文件失败: {error}")),
        };
        let id = unique_name(&original);
        let path = state.uploads.join(&id);
        if let Err(error) = tokio::fs::write(&path, &bytes).await {
            return internal_error(format!("保存文件失败: {error}"));
        }
        match pdf::page_count(&path) {
            Ok(pages) => {
                let meta = FileMeta {
                    id: id.clone(),
                    filename: original,
                    pages,
                    size: bytes.len() as u64,
                };
                let value = meta_json(&state, &meta);
                state.files.lock().unwrap().push(meta);
                uploaded.push(value);
            }
            Err(_) => {
                let _ = std::fs::remove_file(&path);
                rejected.push(json!({ "filename": original }));
            }
        }
    }

    let all_files: Vec<Value> = {
        let files = state.files.lock().unwrap();
        files.iter().map(|meta| meta_json(&state, meta)).collect()
    };

    ok_json(json!({
        "success": true,
        "files": uploaded,
        "all_files": all_files,
        "rejected": rejected,
    }))
}

async fn files(State(state): State<AppState>) -> Response {
    let files = state.files.lock().unwrap();
    ok_json(json!({
        "success": true,
        "files": files.iter().map(|meta| meta_json(&state, meta)).collect::<Vec<_>>(),
    }))
}

#[derive(Deserialize)]
struct ThumbnailQuery {
    page: Option<usize>,
}

async fn thumbnail(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
    Query(query): Query<ThumbnailQuery>,
) -> Response {
    if !is_safe_id(&id) {
        return api_error(StatusCode::BAD_REQUEST, "文件名无效");
    }
    let path = state.uploads.join(&id);
    if !path.is_file() {
        return not_found("File not found");
    }
    let page = query.page.unwrap_or(0);
    match pdf::render_thumbnail(&state.pdfium, &path, page, 480) {
        Ok(bytes) => (
            [
                (header::CONTENT_TYPE, "image/png"),
                (header::CACHE_CONTROL, "max-age=3600"),
            ],
            bytes,
        )
            .into_response(),
        Err(error) => api_error(StatusCode::NOT_FOUND, error),
    }
}

async fn preview_merged(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let file_ids: Vec<String> = body
        .get("file_ids")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if file_ids.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "No files selected");
    }

    let mut preview = Vec::new();
    let mut total_pages = 0usize;
    for id in &file_ids {
        let Some(meta) = lookup_meta(&state, id) else {
            return not_found(format!("File not found: {id}"));
        };
        preview.push(json!({
            "filename": meta.filename,
            "pages": meta.pages,
            "preview": "",
            "page_range": format!("{}-{}", total_pages + 1, total_pages + meta.pages),
        }));
        total_pages += meta.pages;
    }

    ok_json(json!({
        "success": true,
        "preview": preview,
        "total_pages": total_pages,
    }))
}

async fn merge(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let file_ids: Vec<String> = body
        .get("file_ids")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if file_ids.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "No files selected for merging");
    }

    let mut output_name = body
        .get("filename")
        .and_then(Value::as_str)
        .map(sanitize_filename)
        .unwrap_or_else(|| "merged.pdf".to_string());
    if !output_name.to_ascii_lowercase().ends_with(".pdf") {
        output_name.push_str(".pdf");
    }

    let paths: Vec<PathBuf> = file_ids.iter().map(|id| state.uploads.join(id)).collect();
    for path in &paths {
        if !path.is_file() {
            return not_found(format!("File not found: {}", path.display()));
        }
    }

    let stored_name = unique_name(&output_name);
    let output_path = state.outputs.join(&stored_name);
    let result = pdf::merge_pdfs(&paths, &output_path);
    if let Err(error) = result {
        let _ = std::fs::remove_file(&output_path);
        return internal_error(error);
    }

    for path in &paths {
        let _ = std::fs::remove_file(path);
    }
    state
        .files
        .lock()
        .unwrap()
        .retain(|meta| !file_ids.contains(&meta.id));

    ok_json(json!({
        "success": true,
        "merged_file": display_name(&stored_name),
        "download_url": format!("/download/{}", url_segment(&stored_name)),
    }))
}

async fn cleanup(State(state): State<AppState>) -> Response {
    if let Ok(entries) = std::fs::read_dir(&state.uploads) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    state.files.lock().unwrap().clear();
    ok_json(json!({ "success": true, "message": "Cleanup completed" }))
}

async fn download(State(state): State<AppState>, AxPath(name): AxPath<String>) -> Response {
    if !is_safe_id(&name) {
        return api_error(StatusCode::BAD_REQUEST, "文件名无效");
    }
    let path = state.outputs.join(&name);
    match tokio::fs::read(&path).await {
        Ok(bytes) => attachment_response(bytes, &display_name(&name), "application/pdf"),
        Err(_) => not_found("File not found"),
    }
}

async fn multipart_fields(mut multipart: Multipart) -> Result<HashMap<String, (String, Vec<u8>)>, String> {
    let mut fields = HashMap::new();
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| format!("上传数据无效: {e}"))?
    {
        let name = field.name().unwrap_or("").to_string();
        let filename = field.file_name().unwrap_or("").to_string();
        let bytes = field
            .bytes()
            .await
            .map_err(|e| format!("读取上传数据失败: {e}"))?
            .to_vec();
        fields.insert(name, (filename, bytes));
    }
    Ok(fields)
}

fn field_text(fields: &HashMap<String, (String, Vec<u8>)>, name: &str, default: &str) -> String {
    fields
        .get(name)
        .map(|(_, bytes)| String::from_utf8_lossy(bytes).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default.to_string())
}

async fn preview_image(State(_state): State<AppState>, multipart: Multipart) -> Response {
    let fields = match multipart_fields(multipart).await {
        Ok(fields) => fields,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, error),
    };
    let Some((_, bytes)) = fields.get("image") else {
        return api_error(StatusCode::BAD_REQUEST, "No image provided");
    };
    let rotation: f64 = field_text(&fields, "rotation", "0").parse().unwrap_or(0.0);

    match image_pdf::load_and_rotate(bytes, rotation)
        .and_then(|image| image_pdf::preview_data_uri(&image))
    {
        Ok((preview, width, height)) => ok_json(json!({
            "success": true,
            "preview": preview,
            "width": width,
            "height": height,
        })),
        Err(error) => internal_error(error),
    }
}

async fn convert_image(State(state): State<AppState>, multipart: Multipart) -> Response {
    let fields = match multipart_fields(multipart).await {
        Ok(fields) => fields,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, error),
    };
    let Some((_, bytes)) = fields.get("image") else {
        return api_error(StatusCode::BAD_REQUEST, "No image provided");
    };
    let rotation: f64 = field_text(&fields, "rotation", "0").parse().unwrap_or(0.0);
    let mut filename = field_text(&fields, "filename", "converted.pdf");
    if !filename.to_ascii_lowercase().ends_with(".pdf") {
        filename.push_str(".pdf");
    }
    let stored_name = unique_name(&filename);
    let output = state.outputs.join(&stored_name);

    match image_pdf::convert_to_pdf(bytes, rotation, &output) {
        Ok(()) => ok_json(json!({
            "success": true,
            "filename": display_name(&stored_name),
            "download_url": format!("/download/{}", url_segment(&stored_name)),
        })),
        Err(error) => internal_error(error),
    }
}

async fn json_serialize(Json(body): Json<Value>) -> Response {
    let text = body.get("text").and_then(Value::as_str).unwrap_or("");
    let sort_keys = body
        .get("sort_keys")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let ensure_ascii = body
        .get("ensure_ascii")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let indent = match body.get("indent") {
        Some(Value::Number(number)) => number.as_i64().unwrap_or(2),
        Some(Value::String(text)) => text.parse().unwrap_or(2),
        _ => 2,
    }
    .clamp(0, 8) as usize;

    let parsed = match tools::parse_json_string(text) {
        Ok(value) => value,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, error),
    };
    match tools::serialize_json(&parsed, indent, ensure_ascii, sort_keys) {
        Ok((pretty, compact)) => ok_json(json!({
            "success": true,
            "object": parsed,
            "json": pretty,
            "compact_json": compact,
            "type": tools::json_value_type(&parsed),
        })),
        Err(error) => internal_error(error),
    }
}

async fn split_upload(State(state): State<AppState>, multipart: Multipart) -> Response {
    let fields = match multipart_fields(multipart).await {
        Ok(fields) => fields,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, error),
    };
    let Some((original_name, bytes)) = fields.get("file") else {
        return api_error(StatusCode::BAD_REQUEST, "没有选择文件");
    };
    if original_name.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "文件名为空");
    }
    let original = sanitize_filename(original_name);
    let extension = Path::new(&original)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "pdf" | "mobi" | "epub") {
        return api_error(
            StatusCode::BAD_REQUEST,
            "不支持的文件格式，请上传 .pdf、.mobi 或 .epub 格式的文件",
        );
    }

    let path = state.split_uploads.join(unique_name(&original));
    if let Err(error) = tokio::fs::write(&path, bytes).await {
        return internal_error(format!("保存文件失败: {error}"));
    }

    let result = match extension.as_str() {
        "pdf" => pdf::page_count(&path),
        "epub" => ebook::estimate_epub_pages(&path),
        "mobi" => ebook::estimate_mobi_pages(&path),
        _ => unreachable!(),
    };
    let pages = match result {
        Ok(pages) => pages,
        Err(error) => {
            let _ = std::fs::remove_file(&path);
            return api_error(StatusCode::BAD_REQUEST, error);
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let file = SplitFile {
        filename: original.clone(),
        kind: extension.clone(),
        path,
    };
    state
        .split_files
        .lock()
        .unwrap()
        .insert(id.clone(), file);

    ok_json(json!({
        "success": true,
        "file_id": id,
        "filename": original,
        "total_pages": pages,
        "file_size": format_size(bytes.len() as u64),
        "file_size_bytes": bytes.len(),
        "file_type": extension,
    }))
}

async fn convert_file(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let Some(file_id) = body.get("file_id").and_then(Value::as_str) else {
        return api_error(StatusCode::BAD_REQUEST, "缺少必要参数");
    };
    let Some(file) = lookup_split(&state, file_id) else {
        return not_found("找不到上传的文件");
    };

    let stem = Path::new(&file.filename)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("book");
    let output_dir = state.split_outputs.join(file_id);
    if let Err(error) = tokio::fs::create_dir_all(&output_dir).await {
        return internal_error(format!("创建输出目录失败: {error}"));
    }
    let pdf_filename = format!("{stem}.pdf");
    let output_path = output_dir.join(&pdf_filename);

    let result = match file.kind.as_str() {
        "mobi" => ebook::mobi_to_pdf(&file.path, &output_path),
        "epub" => ebook::epub_to_pdf(&file.path, &output_path),
        "pdf" => pdf::page_count(&file.path),
        _ => return api_error(StatusCode::BAD_REQUEST, "不支持的转换类型"),
    };
    let pages = match result {
        Ok(pages) => pages,
        Err(error) => {
            let _ = std::fs::remove_file(&output_path);
            return internal_error(error);
        }
    };
    let size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

    ok_json(json!({
        "success": true,
        "pdf_filename": pdf_filename,
        "pdf_size": format_size(size),
        "total_pages": pages,
        "download_url": format!("/split-download/{file_id}/{}", url_segment(&pdf_filename)),
    }))
}

async fn split_pdf(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let Some(file_id) = body.get("file_id").and_then(Value::as_str) else {
        return api_error(StatusCode::BAD_REQUEST, "缺少必要参数");
    };
    let pages_per_split = match body
        .get("pages_per_split")
        .map(|value| match value {
            Value::Number(number) => number.as_i64().unwrap_or(0),
            Value::String(text) => text.parse().unwrap_or(0),
            _ => 0,
        }) {
        Some(value) if value > 0 => value as usize,
        _ => return api_error(StatusCode::BAD_REQUEST, "拆分页数必须大于0"),
    };

    let Some(file) = lookup_split(&state, file_id) else {
        return not_found("找不到上传的文件");
    };

    let output_dir = state.split_outputs.join(file_id);
    let converted = std::fs::read_dir(&output_dir)
        .ok()
        .and_then(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .find(|path| {
                    path.extension()
                        .and_then(|ext| ext.to_str())
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
                })
        });

    let source = if let Some(path) = converted {
        path
    } else if file.kind == "pdf" {
        file.path.clone()
    } else {
        return api_error(StatusCode::BAD_REQUEST, "请先将文件转换为 PDF");
    };

    let stem = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("document");
    let parts = match pdf::split_pdf(&source, pages_per_split, &output_dir, stem) {
        Ok(parts) => parts,
        Err(error) => return internal_error(error),
    };

    let split_files: Vec<Value> = parts
        .iter()
        .map(|part| {
            json!({
                "filename": part.filename,
                "pages": format!("第{}-{}页", part.start, part.end),
                "file_size": format_size(part.size),
                "download_url": format!(
                    "/split-download/{file_id}/{}",
                    url_segment(&part.filename)
                ),
            })
        })
        .collect();

    ok_json(json!({
        "success": true,
        "total_splits": split_files.len(),
        "split_files": split_files,
    }))
}

async fn split_download(
    State(state): State<AppState>,
    AxPath((file_id, filename)): AxPath<(String, String)>,
) -> Response {
    if !is_safe_id(&file_id) || !is_safe_id(&filename) {
        return api_error(StatusCode::BAD_REQUEST, "文件名无效");
    }
    let path = state.split_outputs.join(&file_id).join(&filename);
    match tokio::fs::read(&path).await {
        Ok(bytes) => attachment_response(bytes, &filename, "application/pdf"),
        Err(_) => not_found("文件不存在"),
    }
}

async fn md_upload(State(state): State<AppState>, multipart: Multipart) -> Response {
    let fields = match multipart_fields(multipart).await {
        Ok(fields) => fields,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, error),
    };
    let Some((original_name, bytes)) = fields.get("file") else {
        return api_error(StatusCode::BAD_REQUEST, "没有选择文件");
    };
    if original_name.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "文件名为空");
    }
    let original = sanitize_filename(original_name);
    let extension = Path::new(&original)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "txt") {
        return api_error(StatusCode::BAD_REQUEST, "不支持的文件格式，请上传 .md 或 .txt 文件");
    }

    let path = state.md_uploads.join(unique_name(&original));
    if let Err(error) = tokio::fs::write(&path, bytes).await {
        return internal_error(format!("保存文件失败: {error}"));
    }
    let content = String::from_utf8_lossy(bytes).to_string();
    let word_count = content.split_whitespace().count();
    let char_count = content.chars().count();
    let preview = if char_count > 500 {
        format!("{}...", content.chars().take(500).collect::<String>())
    } else {
        content.clone()
    };

    let id = uuid::Uuid::new_v4().to_string();
    state.md_files.lock().unwrap().insert(
        id.clone(),
        MdFile {
            filename: original.clone(),
            path,
        },
    );

    ok_json(json!({
        "success": true,
        "file_id": id,
        "filename": original,
        "file_size": format_size(bytes.len() as u64),
        "word_count": word_count,
        "char_count": char_count,
        "preview": preview,
    }))
}

async fn md_convert(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let file_id = body.get("file_id").and_then(Value::as_str);
    let content = body.get("content").and_then(Value::as_str);

    let (markdown, original) = if let Some(id) = file_id {
        let Some(file) = state.md_files.lock().unwrap().get(id).cloned() else {
            return not_found("找不到上传的文件");
        };
        match std::fs::read(&file.path) {
            Ok(bytes) => (String::from_utf8_lossy(&bytes).to_string(), file.filename),
            Err(error) => return internal_error(format!("读取文件失败: {error}")),
        }
    } else if let Some(content) = content {
        (content.to_string(), "document.md".to_string())
    } else {
        return api_error(StatusCode::BAD_REQUEST, "缺少必要参数");
    };

    let folder_name = file_id
        .map(str::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let output_dir = state.md_outputs.join(&folder_name);
    if let Err(error) = tokio::fs::create_dir_all(&output_dir).await {
        return internal_error(format!("创建输出目录失败: {error}"));
    }
    let stem = Path::new(&original)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("document");
    let docx_filename = format!("{stem}.docx");
    let output_path = output_dir.join(&docx_filename);

    if let Err(error) = md_docx::convert(&markdown, stem, &output_path) {
        let _ = std::fs::remove_file(&output_path);
        return internal_error(error);
    }
    let size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

    ok_json(json!({
        "success": true,
        "docx_filename": docx_filename,
        "docx_size": format_size(size),
        "download_url": format!("/md-download/{folder_name}/{}", url_segment(&docx_filename)),
    }))
}

async fn md_download(
    State(state): State<AppState>,
    AxPath((folder, filename)): AxPath<(String, String)>,
) -> Response {
    if !is_safe_id(&folder) || !is_safe_id(&filename) {
        return api_error(StatusCode::BAD_REQUEST, "文件名无效");
    }
    let path = state.md_outputs.join(&folder).join(&filename);
    match tokio::fs::read(&path).await {
        Ok(bytes) => attachment_response(
            bytes,
            &filename,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        Err(_) => not_found("文件不存在"),
    }
}

fn body_text(body: &Value, key: &str) -> Result<String, String> {
    body.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| format!("{key}不能为空"))
}

fn body_i64(body: &Value, key: &str, default: i64) -> Result<i64, String> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(Value::Number(number)) => number
            .as_i64()
            .ok_or_else(|| format!("{key}必须是数字")),
        Some(Value::String(text)) => text.parse().map_err(|_| format!("{key}必须是数字")),
        _ => Err(format!("{key}必须是数字")),
    }
}

async fn api_text_stats(Json(body): Json<Value>) -> Response {
    let text = body.get("text").and_then(Value::as_str).unwrap_or("");
    if text.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "文本不能为空");
    }
    ok_json(tools::text_stats(text))
}

async fn api_hash_text(Json(body): Json<Value>) -> Response {
    let text = body.get("text").and_then(Value::as_str).unwrap_or("");
    if text.is_empty() {
        return api_error(StatusCode::BAD_REQUEST, "文本不能为空");
    }
    let algorithm = body
        .get("algorithm")
        .and_then(Value::as_str)
        .unwrap_or("md5");
    match tools::hash_text(text, algorithm) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_generate_token(Json(body): Json<Value>) -> Response {
    let length = match body_i64(&body, "length", 32) {
        Ok(value) => value,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let flag = |key: &str, default: bool| {
        body.get(key)
            .and_then(Value::as_bool)
            .unwrap_or(default)
    };
    match tools::generate_token(
        length,
        flag("include_uppercase", true),
        flag("include_lowercase", true),
        flag("include_numbers", true),
        flag("include_symbols", false),
    ) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_json_yaml(Json(body): Json<Value>) -> Response {
    let text = match body_text(&body, "text") {
        Ok(text) => text,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let direction = body
        .get("direction")
        .and_then(Value::as_str)
        .unwrap_or("json-to-yaml");
    match tools::json_yaml_convert(&text, direction) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_bcrypt(Json(body): Json<Value>) -> Response {
    let text = match body_text(&body, "text") {
        Ok(text) => text,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let rounds = match body_i64(&body, "rounds", 12) {
        Ok(value) => value as u32,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    match tools::bcrypt_hash(&text, rounds) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_encrypt(Json(body): Json<Value>) -> Response {
    let text = match body_text(&body, "text") {
        Ok(text) => text,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let key = match body_text(&body, "key") {
        Ok(key) => key,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let action = body
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("encrypt");
    match tools::encrypt_text(&text, &key, action) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_hmac(Json(body): Json<Value>) -> Response {
    let text = match body_text(&body, "text") {
        Ok(text) => text,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let key = match body_text(&body, "key") {
        Ok(key) => key,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let algorithm = body
        .get("algorithm")
        .and_then(Value::as_str)
        .unwrap_or("sha256");
    match tools::hmac_generate(&text, &key, algorithm) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_bip39(Json(body): Json<Value>) -> Response {
    let strength = match body_i64(&body, "strength", 128) {
        Ok(value) => value,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    match tools::bip39_generate(strength) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_uuid(Json(body): Json<Value>) -> Response {
    let version = body
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("v4");
    let count = match body_i64(&body, "count", 1) {
        Ok(value) => value,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    match tools::generate_uuid(version, count) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_ulid(Json(body): Json<Value>) -> Response {
    let count = match body_i64(&body, "count", 1) {
        Ok(value) => value,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    match tools::generate_ulid(count) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn api_boolean(Json(body): Json<Value>) -> Response {
    let expression = match body_text(&body, "expression") {
        Ok(expression) => expression,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    match tools::boolean_logic(&expression) {
        Ok(value) => ok_json(value),
        Err(error) => api_error(StatusCode::BAD_REQUEST, format!("表达式错误: {error}")),
    }
}

async fn api_url_params(Json(body): Json<Value>) -> Response {
    let action = body
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("parse");
    if action == "parse" {
        let url = match body_text(&body, "url") {
            Ok(url) => url,
            Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
        };
        match tools::url_params_parse(&url) {
            Ok(value) => ok_json(value),
            Err(error) => api_error(StatusCode::BAD_REQUEST, error),
        }
    } else {
        let base_url = match body_text(&body, "base_url") {
            Ok(url) => url,
            Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
        };
        let params = body.get("params").cloned().unwrap_or_else(|| json!({}));
        match tools::url_params_build(&base_url, &params) {
            Ok(value) => ok_json(value),
            Err(error) => api_error(StatusCode::BAD_REQUEST, error),
        }
    }
}
