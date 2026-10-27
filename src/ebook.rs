use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path};

use genpdf::fonts::{FontData, FontFamily};
use percent_encoding::percent_decode_str;
use roxmltree::Document as XmlDocument;
use zip::ZipArchive;

fn read_entry(zip: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, String> {
    let mut file = zip
        .by_name(name)
        .map_err(|e| format!("无法读取 {name}: {e}"))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("无法读取 {name}: {e}"))?;
    Ok(buffer)
}

fn read_text(zip: &mut ZipArchive<File>, name: &str) -> Result<String, String> {
    let bytes = read_entry(zip, name)?;
    Ok(decode_text(&bytes))
}

fn decode_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).to_string();
    text.trim_start_matches('\u{feff}').to_string()
}

fn resolve_zip_path(base: &Path, href: &str) -> String {
    let href = href.split('#').next().unwrap_or(href);
    let decoded = percent_decode_str(href).decode_utf8_lossy();
    let joined = base.join(decoded.as_ref());
    let mut parts: Vec<String> = Vec::new();
    for component in joined.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::ParentDir => {
                parts.pop();
            }
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }
    parts.join("/")
}

fn normalize_text(text: &str) -> String {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines: Vec<String> = text
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect();
    while lines.first().is_some_and(|line| line.is_empty()) {
        lines.remove(0);
    }
    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

fn html_to_text(html: &str) -> String {
    match html2text::from_read(html.as_bytes(), 120) {
        Ok(text) => normalize_text(&text),
        Err(_) => normalize_text(html),
    }
}

fn epub_text(path: &Path) -> Result<(String, Option<String>), String> {
    let file = File::open(path).map_err(|e| format!("无法打开 EPUB: {e}"))?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("EPUB 格式无效: {e}"))?;

    let opf_path = {
        let container = read_text(&mut zip, "META-INF/container.xml")?;
        let document = XmlDocument::parse(&container)
            .map_err(|e| format!("EPUB container.xml 解析失败: {e}"))?;
        document
            .descendants()
            .find(|node| node.has_tag_name("rootfile"))
            .and_then(|node| node.attribute("full-path"))
            .map(str::to_string)
            .ok_or_else(|| "EPUB 缺少内容清单".to_string())?
    };

    let opf_text = read_text(&mut zip, &opf_path)?;
    let opf = XmlDocument::parse(&opf_text)
        .map_err(|e| format!("EPUB 内容清单解析失败: {e}"))?;

    let title = opf
        .descendants()
        .find(|node| node.has_tag_name("title"))
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());

    let base = Path::new(&opf_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();

    let mut manifest: HashMap<String, String> = HashMap::new();
    for item in opf.descendants().filter(|node| node.has_tag_name("item")) {
        if let (Some(id), Some(href)) = (item.attribute("id"), item.attribute("href")) {
            manifest.insert(id.to_string(), href.to_string());
        }
    }

    let mut chapters: Vec<String> = Vec::new();
    for itemref in opf.descendants().filter(|node| node.has_tag_name("itemref")) {
        if let Some(idref) = itemref.attribute("idref") {
            if let Some(href) = manifest.get(idref) {
                let name = resolve_zip_path(&base, href);
                if let Ok(html) = read_text(&mut zip, &name) {
                    let text = html_to_text(&html);
                    if !text.is_empty() {
                        chapters.push(text);
                    }
                }
            }
        }
    }

    // Some EPUBs omit the spine; fall back to every HTML document in the archive.
    if chapters.is_empty() {
        let names: Vec<String> = (0..zip.len())
            .filter_map(|index| {
                zip.by_index(index)
                    .ok()
                    .and_then(|file| file.name().ok().map(|name| name.to_string()))
            })
            .filter(|name| {
                let lower = name.to_ascii_lowercase();
                lower.ends_with(".xhtml") || lower.ends_with(".html") || lower.ends_with(".htm")
            })
            .collect();
        for name in names {
            if let Ok(html) = read_text(&mut zip, &name) {
                let text = html_to_text(&html);
                if !text.is_empty() {
                    chapters.push(text);
                }
            }
        }
    }

    Ok((chapters.join("\n\n"), title))
}

pub fn mobi_text(path: &Path) -> Result<String, String> {
    let book = mobi::Mobi::from_path(path).map_err(|e| format!("MOBI 解析失败: {e}"))?;
    let html = book
        .content_as_string()
        .unwrap_or_else(|_| book.content_as_string_lossy());
    if html.trim().is_empty() {
        return Err("MOBI 文件内容为空".to_string());
    }
    Ok(html_to_text(&html))
}

pub fn estimate_epub_pages(path: &Path) -> Result<usize, String> {
    let (text, _) = epub_text(path)?;
    Ok((text.chars().count() / 3000).max(1))
}

pub fn estimate_mobi_pages(path: &Path) -> Result<usize, String> {
    let text = mobi_text(path)?;
    Ok((text.chars().count() / 3000).max(1))
}

fn font_family() -> Result<FontFamily<FontData>, String> {
    let candidates = [
        "C:\\Windows\\Fonts\\simhei.ttf",
        "C:\\Windows\\Fonts\\Deng.ttf",
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\arial.ttf",
    ];
    let mut last_error = String::new();
    for candidate in candidates {
        if !Path::new(candidate).exists() {
            continue;
        }
        match FontData::load(candidate, None) {
            Ok(regular) => {
                return Ok(FontFamily {
                    regular: regular.clone(),
                    bold: regular.clone(),
                    italic: regular.clone(),
                    bold_italic: regular,
                });
            }
            Err(error) => last_error = format!("{candidate}: {error}"),
        }
    }
    Err(if last_error.is_empty() {
        "系统缺少可用的中文字体".to_string()
    } else {
        format!("无法加载字体: {last_error}")
    })
}

pub fn to_pdf(text: &str, title: Option<&str>, output: &Path) -> Result<(), String> {
    let font_family = font_family()?;
    let mut document = genpdf::Document::new(font_family);
    document.set_title(title.unwrap_or("Converted document"));
    document.set_font_size(11);
    document.set_line_spacing(1.6);
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(20);
    document.set_page_decorator(decorator);

    let mut wrote_any = false;
    for block in text.split("\n\n") {
        let paragraph = block
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if paragraph.is_empty() {
            continue;
        }
        document.push(genpdf::elements::Paragraph::new(paragraph));
        document.push(genpdf::elements::Break::new(0.5));
        wrote_any = true;
    }

    if !wrote_any {
        document.push(genpdf::elements::Paragraph::new(" "));
    }

    document
        .render_to_file(output)
        .map_err(|e| format!("生成 PDF 失败: {e}"))?;
    Ok(())
}

pub fn epub_to_pdf(path: &Path, output: &Path) -> Result<usize, String> {
    let (text, title) = epub_text(path)?;
    to_pdf(&text, title.as_deref(), output)?;
    super::pdf::page_count(output)
}

pub fn mobi_to_pdf(path: &Path, output: &Path) -> Result<usize, String> {
    let text = mobi_text(path)?;
    to_pdf(&text, None, output)?;
    super::pdf::page_count(output)
}
