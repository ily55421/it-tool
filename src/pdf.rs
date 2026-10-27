use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::ImageFormat;
use lopdf::{Document, Object, ObjectId};
use pdfium_render::prelude::{PdfRenderConfig, Pdfium};

pub struct SplitPart {
    pub filename: String,
    pub start: usize,
    pub end: usize,
    pub size: u64,
}

pub fn page_count(path: &Path) -> Result<usize, String> {
    let doc = Document::load(path).map_err(|e| format!("无法读取 PDF: {e}"))?;
    let pages = doc.get_pages().len();
    if pages == 0 {
        return Err("PDF 中没有页面".to_string());
    }
    Ok(pages)
}

pub fn render_thumbnail(
    pdfium: &Pdfium,
    path: &Path,
    page_index: usize,
    width: i32,
) -> Result<Vec<u8>, String> {
    let doc = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| format!("无法打开 PDF: {e}"))?;
    let pages = doc.pages();
    if page_index as i32 >= pages.len() {
        return Err("页码超出范围".to_string());
    }
    let page = pages
        .get(page_index as i32)
        .map_err(|e| format!("无法读取页面: {e}"))?;
    let config = PdfRenderConfig::new()
        .set_target_width(width)
        .set_maximum_height(900);
    let bitmap = page
        .render_with_config(&config)
        .map_err(|e| format!("页面渲染失败: {e}"))?;
    let image = bitmap
        .as_image()
        .map_err(|e| format!("页面转换失败: {e}"))?;
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(|e| format!("缩略图编码失败: {e}"))?;
    Ok(out)
}

pub fn merge_pdfs(paths: &[PathBuf], output: &Path) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有选择要合并的文件".to_string());
    }

    let mut max_id = 1u32;
    let mut documents_pages: BTreeMap<ObjectId, Object> = BTreeMap::new();
    let mut documents_objects: BTreeMap<ObjectId, Object> = BTreeMap::new();
    let mut document = Document::with_version("1.5");

    for path in paths {
        let mut doc = Document::load(path)
            .map_err(|e| format!("无法读取 {}: {e}", path.display()))?;

        // Resolve inherited page attributes before renumbering, otherwise a missing
        // reference could silently alias an object from another document.
        for page_id in doc.get_pages().into_values() {
            let page = materialize_page_attributes(&doc, page_id)?;
            doc.objects.insert(page_id, Object::Dictionary(page));
        }

        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;

        for object_id in doc.get_pages().into_values() {
            let object = doc
                .get_object(object_id)
                .map_err(|e| format!("读取页面失败: {e}"))?
                .clone();
            documents_pages.insert(object_id, object);
        }
        documents_objects.extend(doc.objects);
    }

    let mut catalog_object: Option<(ObjectId, Object)> = None;
    let mut pages_object: Option<(ObjectId, Object)> = None;

    for (object_id, object) in documents_objects {
        match object.type_name().unwrap_or(b"") {
            b"Catalog" => {
                let id = catalog_object
                    .as_ref()
                    .map(|(id, _)| *id)
                    .unwrap_or(object_id);
                catalog_object = Some((id, object));
            }
            b"Pages" => {
                let mut dictionary = object
                    .as_dict()
                    .map_err(|e| format!("页面树格式错误: {e}"))?
                    .clone();
                if let Some((_, ref previous)) = pages_object {
                    if let Ok(old) = previous.as_dict() {
                        dictionary.extend(old);
                    }
                }
                let id = pages_object
                    .as_ref()
                    .map(|(id, _)| *id)
                    .unwrap_or(object_id);
                pages_object = Some((id, Object::Dictionary(dictionary)));
            }
            b"Page" | b"Outlines" | b"Outline" => {}
            _ => {
                document.objects.insert(object_id, object);
            }
        }
    }

    let (pages_id, pages_raw) = pages_object.ok_or("PDF 缺少页面树")?;
    let mut pages_dict = pages_raw
        .as_dict()
        .map_err(|e| format!("页面树格式错误: {e}"))?
        .clone();
    pages_dict.remove(b"Parent");
    for key in ["MediaBox", "CropBox", "Resources", "Rotate"] {
        pages_dict.remove(key.as_bytes());
    }
    pages_dict.set("Count", Object::Integer(documents_pages.len() as i64));
    pages_dict.set(
        "Kids",
        Object::Array(
            documents_pages
                .keys()
                .map(|id| Object::Reference(*id))
                .collect(),
        ),
    );
    document.objects.insert(pages_id, Object::Dictionary(pages_dict));

    for (object_id, object) in documents_pages {
        if let Ok(dictionary) = object.as_dict() {
            let mut dictionary = dictionary.clone();
            dictionary.set("Parent", Object::Reference(pages_id));
            document
                .objects
                .insert(object_id, Object::Dictionary(dictionary));
        }
    }

    let (catalog_id, catalog_raw) = catalog_object.ok_or("PDF 缺少目录对象")?;
    let mut catalog_dict = catalog_raw
        .as_dict()
        .map_err(|e| format!("目录对象格式错误: {e}"))?
        .clone();
    catalog_dict.set("Pages", Object::Reference(pages_id));
    catalog_dict.remove(b"Outlines");
    document
        .objects
        .insert(catalog_id, Object::Dictionary(catalog_dict));
    document.trailer.set("Root", Object::Reference(catalog_id));

    document.max_id = document.objects.keys().map(|(id, _)| *id).max().unwrap_or(0);
    document.renumber_objects();
    document
        .save(output)
        .map_err(|e| format!("保存合并结果失败: {e}"))?;
    Ok(())
}

pub fn split_pdf(
    source: &Path,
    pages_per_split: usize,
    output_dir: &Path,
    stem: &str,
) -> Result<Vec<SplitPart>, String> {
    if pages_per_split == 0 {
        return Err("拆分页数必须大于 0".to_string());
    }
    let total = page_count(source)?;
    fs::create_dir_all(output_dir).map_err(|e| format!("无法创建输出目录: {e}"))?;

    let mut parts = Vec::new();
    let mut part_number = 1usize;
    let mut start = 0usize;

    while start < total {
        let end = (start + pages_per_split).min(total);
        let mut doc = Document::load(source).map_err(|e| format!("无法读取 PDF: {e}"))?;

        let keep: HashSet<u32> = ((start as u32 + 1)..=(end as u32)).collect();
        let to_delete: Vec<u32> = (1..=total as u32)
            .filter(|page| !keep.contains(page))
            .collect();
        if !to_delete.is_empty() {
            doc.delete_pages(&to_delete);
        }

        let filename = format!("{stem}_part{part_number}.pdf");
        let output_path = output_dir.join(&filename);
        doc.save(&output_path)
            .map_err(|e| format!("保存拆分文件失败: {e}"))?;
        let size = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

        parts.push(SplitPart {
            filename,
            start: start + 1,
            end,
            size,
        });
        start = end;
        part_number += 1;
    }

    Ok(parts)
}

fn inherited_page_attribute(
    doc: &Document,
    page_id: ObjectId,
    key: &[u8],
) -> Result<Option<Object>, String> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    loop {
        if !visited.insert(current) {
            return Err("PDF 页面属性存在循环引用".to_string());
        }
        let node = doc
            .get_dictionary(current)
            .map_err(|e| format!("读取页面属性失败: {e}"))?;
        if let Ok(value) = node.get(key) {
            match doc.dereference(value) {
                Ok((_, Object::Null)) | Err(_) => {}
                Ok(_) => return Ok(Some(value.clone())),
            }
        }
        match node.get(b"Parent") {
            Err(_) | Ok(Object::Null) => return Ok(None),
            Ok(parent) => {
                current = parent
                    .as_reference()
                    .map_err(|e| format!("页面树引用错误: {e}"))?
            }
        }
    }
}

fn materialize_page_attributes(doc: &Document, page_id: ObjectId) -> Result<lopdf::Dictionary, String> {
    let mut page = doc
        .get_dictionary(page_id)
        .map_err(|e| format!("读取页面失败: {e}"))?
        .clone();
    let media_box = inherited_page_attribute(doc, page_id, b"MediaBox")?
        .ok_or_else(|| "页面缺少 MediaBox".to_string())?;
    let crop_box =
        inherited_page_attribute(doc, page_id, b"CropBox")?.unwrap_or_else(|| media_box.clone());
    let resources = inherited_page_attribute(doc, page_id, b"Resources")?
        .unwrap_or_else(|| Object::Dictionary(lopdf::Dictionary::new()));
    let rotation = inherited_page_attribute(doc, page_id, b"Rotate")?
        .unwrap_or(Object::Integer(0));
    page.set("MediaBox", media_box);
    page.set("CropBox", crop_box);
    page.set("Resources", resources);
    page.set("Rotate", rotation);
    Ok(page)
}
