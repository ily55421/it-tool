use std::fs::File;
use std::io::Write;
use std::path::Path;

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Clone, Default)]
struct Run {
    text: String,
    bold: bool,
    italic: bool,
    code: bool,
}

enum Block {
    Paragraph {
        runs: Vec<Run>,
        style: ParaStyle,
    },
    ListItem {
        runs: Vec<Run>,
        marker: String,
        level: usize,
    },
    Code(String),
    Table {
        rows: Vec<(bool, Vec<String>)>,
    },
    Rule,
}

enum ParaStyle {
    Normal,
    Heading(u8),
    Quote,
}

struct ListCtx {
    next: Option<u64>,
}

struct TableCtx {
    rows: Vec<(bool, Vec<String>)>,
    current: Vec<String>,
    header: bool,
}

#[derive(Default)]
struct MdState {
    blocks: Vec<Block>,
    inline: Vec<Run>,
    bold: usize,
    italic: usize,
    heading: Option<u8>,
    quote: usize,
    lists: Vec<ListCtx>,
    item: Option<String>,
    code: Option<String>,
    table: Option<TableCtx>,
    cell: String,
}

impl MdState {
    fn push_text(&mut self, text: &str) {
        if let Some(table) = self.table.as_mut() {
            table.cell_push(text);
            return;
        }
        if let Some(code) = self.code.as_mut() {
            code.push_str(text);
            return;
        }
        self.inline.push(Run {
            text: text.to_string(),
            bold: self.bold > 0,
            italic: self.italic > 0,
            code: false,
        });
    }

    fn flush_paragraph(&mut self, style: ParaStyle) {
        if self.inline.is_empty() {
            return;
        }
        let runs = std::mem::take(&mut self.inline);
        if let Some(marker) = self.item.take() {
            self.blocks.push(Block::ListItem {
                runs,
                marker,
                level: self.lists.len().max(1),
            });
        } else {
            self.blocks.push(Block::Paragraph { runs, style });
        }
    }

    fn finish_item(&mut self) {
        if self.item.is_none() {
            return;
        }
        if self.inline.is_empty() {
            self.item = None;
            return;
        }
        let marker = self.item.take().unwrap_or_default();
        let runs = std::mem::take(&mut self.inline);
        self.blocks.push(Block::ListItem {
            runs,
            marker,
            level: self.lists.len().max(1),
        });
    }

    fn flush_code(&mut self) {
        if let Some(code) = self.code.take() {
            let code = code.trim_end_matches('\n').to_string();
            if !code.trim().is_empty() {
                self.blocks.push(Block::Code(code));
            }
        }
    }
}

impl TableCtx {
    fn cell_push(&mut self, text: &str) {
        // Table cells are collected separately by the parser state.
        let _ = text;
    }
}

fn parse_markdown(markdown: &str) -> Vec<Block> {
    let mut state = MdState::default();
    let parser = Parser::new_ext(markdown, Options::all());

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    if state.item.is_none() {
                        state.flush_paragraph(if state.quote > 0 {
                            ParaStyle::Quote
                        } else {
                            ParaStyle::Normal
                        });
                    }
                }
                Tag::Heading { level, .. } => {
                    state.heading = Some(level as u8);
                }
                Tag::BlockQuote(_) => {
                    state.quote += 1;
                }
                Tag::CodeBlock(kind) => {
                    let mut code = String::new();
                    if let CodeBlockKind::Fenced(language) = kind {
                        if !language.trim().is_empty() {
                            code.push_str(&format!("// {}\n", language.trim()));
                        }
                    }
                    state.code = Some(code);
                }
                Tag::List(start) => {
                    state.lists.push(ListCtx { next: start });
                }
                Tag::Item => {
                    if state.item.is_some() {
                        state.finish_item();
                    }
                    let marker = match state.lists.last_mut() {
                        Some(list) => match list.next.as_mut() {
                            Some(number) => {
                                let current = *number;
                                *number += 1;
                                format!("{current}. ")
                            }
                            None => "• ".to_string(),
                        },
                        None => "• ".to_string(),
                    };
                    state.item = Some(marker);
                }
                Tag::Table(_) => {
                    state.table = Some(TableCtx {
                        rows: Vec::new(),
                        current: Vec::new(),
                        header: false,
                    });
                }
                Tag::TableHead => {
                    if let Some(table) = state.table.as_mut() {
                        table.header = true;
                        table.current.clear();
                    }
                }
                Tag::TableRow => {
                    if let Some(table) = state.table.as_mut() {
                        table.current.clear();
                    }
                }
                Tag::TableCell => {
                    state.cell.clear();
                }
                Tag::Emphasis => state.italic += 1,
                Tag::Strong => state.bold += 1,
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => {
                    if state.item.is_some() {
                        state.finish_item();
                    } else {
                        state.flush_paragraph(if state.quote > 0 {
                            ParaStyle::Quote
                        } else {
                            ParaStyle::Normal
                        });
                    }
                }
                TagEnd::Heading(_) => {
                    let level = state.heading.take().unwrap_or(1);
                    state.flush_paragraph(ParaStyle::Heading(level));
                }
                TagEnd::BlockQuote(_) => {
                    state.quote = state.quote.saturating_sub(1);
                }
                TagEnd::CodeBlock => {
                    state.flush_code();
                }
                TagEnd::List(_) => {
                    state.lists.pop();
                }
                TagEnd::Item => {
                    state.finish_item();
                }
                TagEnd::Table => {
                    if let Some(mut table) = state.table.take() {
                        if !table.current.is_empty() {
                            table.rows.push((table.header, std::mem::take(&mut table.current)));
                        }
                        if !table.rows.is_empty() {
                            state.blocks.push(Block::Table { rows: table.rows });
                        }
                    }
                }
                TagEnd::TableHead => {
                    if let Some(table) = state.table.as_mut() {
                        table.rows.push((true, std::mem::take(&mut table.current)));
                        table.header = false;
                    }
                }
                TagEnd::TableRow => {
                    if let Some(table) = state.table.as_mut() {
                        if !table.current.is_empty() {
                            table.rows.push((table.header, std::mem::take(&mut table.current)));
                        }
                    }
                }
                TagEnd::TableCell => {
                    if let Some(table) = state.table.as_mut() {
                        table.current.push(state.cell.trim().to_string());
                    }
                    state.cell.clear();
                }
                TagEnd::Emphasis => state.italic = state.italic.saturating_sub(1),
                TagEnd::Strong => state.bold = state.bold.saturating_sub(1),
                _ => {}
            },
            Event::Text(text) => {
                if state.table.is_some() {
                    state.cell.push_str(&text);
                } else {
                    state.push_text(&text);
                }
            }
            Event::Code(code) => {
                if state.table.is_some() {
                    state.cell.push_str(&code);
                } else {
                    state.inline.push(Run {
                        text: code.to_string(),
                        bold: state.bold > 0,
                        italic: state.italic > 0,
                        code: true,
                    });
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if state.table.is_some() {
                    state.cell.push(' ');
                } else if state.code.is_some() {
                    if let Some(code) = state.code.as_mut() {
                        code.push('\n');
                    }
                } else {
                    state.push_text(" ");
                }
            }
            Event::Rule => {
                state.flush_paragraph(ParaStyle::Normal);
                state.blocks.push(Block::Rule);
            }
            Event::TaskListMarker(checked) => {
                state.push_text(if checked { "☑ " } else { "☐ " });
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                if state.table.is_some() {
                    state.cell.push_str(&strip_tags(&html));
                } else if state.code.is_none() {
                    let text = strip_tags(&html);
                    if !text.trim().is_empty() {
                        state.push_text(&text);
                    }
                }
            }
            _ => {}
        }
    }

    state.flush_paragraph(ParaStyle::Normal);
    state.blocks
}

fn strip_tags(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn run_xml(run: &Run, size: &str) -> String {
    let font = if run.code { "Consolas" } else { "微软雅黑" };
    let mut properties = format!(
        "<w:rFonts w:ascii=\"{font}\" w:eastAsia=\"{font}\" w:hAnsi=\"{font}\"/>\
         <w:sz w:val=\"{size}\"/><w:szCs w:val=\"{size}\"/>"
    );
    if run.bold {
        properties.push_str("<w:b/><w:bCs/>");
    }
    if run.italic {
        properties.push_str("<w:i/><w:iCs/>");
    }
    if run.code {
        properties.push_str("<w:color w:val=\"A31515\"/>");
    }

    let mut text = String::new();
    for (index, part) in run.text.split('\n').enumerate() {
        if index > 0 {
            text.push_str("<w:br/>");
        }
        if !part.is_empty() {
            text.push_str(&format!(
                "<w:t xml:space=\"preserve\">{}</w:t>",
                escape_xml(part)
            ));
        }
    }
    format!("<w:r><w:rPr>{properties}</w:rPr>{text}</w:r>")
}

fn paragraph_xml(
    runs: &[Run],
    size: &str,
    align_center: bool,
    indent_first_line: Option<u32>,
    indent_left: Option<u32>,
    shading: Option<&str>,
    quote: bool,
) -> String {
    let mut props = String::from("<w:spacing w:before=\"0\" w:after=\"120\" w:line=\"360\" w:lineRule=\"auto\"/>");
    if align_center {
        props.push_str("<w:jc w:val=\"center\"/>");
    }
    if let Some(indent) = indent_first_line {
        props.push_str(&format!("<w:ind w:firstLine=\"{indent}\"/>"));
    }
    if let Some(indent) = indent_left {
        props.push_str(&format!("<w:ind w:left=\"{indent}\"/>"));
    }
    if quote {
        props.push_str("<w:ind w:left=\"720\"/><w:jc w:val=\"both\"/>");
    }
    if let Some(fill) = shading {
        props.push_str(&format!("<w:shd w:val=\"clear\" w:fill=\"{fill}\"/>"));
    }

    let mut body = String::new();
    for run in runs {
        if quote {
            let quoted = Run {
                text: run.text.clone(),
                bold: run.bold,
                italic: true,
                code: run.code,
            };
            body.push_str(&run_xml(&quoted, size));
        } else {
            body.push_str(&run_xml(run, size));
        }
    }
    format!("<w:p><w:pPr>{props}</w:pPr>{body}</w:p>")
}

fn table_xml(rows: &[(bool, Vec<String>)]) -> String {
    let columns = rows.iter().map(|(_, cells)| cells.len()).max().unwrap_or(1);
    let mut xml = String::from(
        "<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/>\
         <w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders>\
         <w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         <w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         <w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         <w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         <w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         <w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>\
         </w:tblBorders></w:tblPr><w:tblGrid>",
    );
    for _ in 0..columns {
        xml.push_str("<w:gridCol w:w=\"2400\"/>");
    }
    xml.push_str("</w:tblGrid>");

    for (is_header, cells) in rows {
        xml.push_str("<w:tr>");
        for index in 0..columns {
            let text = cells.get(index).map(String::as_str).unwrap_or("");
            let run = Run {
                text: text.to_string(),
                bold: *is_header,
                italic: false,
                code: false,
            };
            let mut tc_props = String::from("<w:tcW w:w=\"0\" w:type=\"auto\"/>");
            if *is_header {
                tc_props.push_str("<w:shd w:val=\"clear\" w:fill=\"F2F2F2\"/>");
            }
            xml.push_str(&format!(
                "<w:tc><w:tcPr>{tc_props}</w:tcPr><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/></w:pPr>{}</w:p></w:tc>",
                run_xml(&run, "22")
            ));
        }
        xml.push_str("</w:tr>");
    }
    xml.push_str("</w:tbl><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"120\"/></w:pPr></w:p>");
    xml
}

fn blocks_to_document_xml(blocks: &[Block]) -> String {
    let mut body = String::new();
    for block in blocks {
        match block {
            Block::Paragraph { runs, style } => match style {
                ParaStyle::Normal => {
                    body.push_str(&paragraph_xml(
                        runs,
                        "22",
                        false,
                        Some(720),
                        None,
                        None,
                        false,
                    ));
                }
                ParaStyle::Heading(level) => {
                    let (size, center) = match level {
                        1 => ("40", true),
                        2 => ("32", false),
                        3 => ("28", false),
                        4 => ("26", false),
                        5 => ("24", false),
                        _ => ("22", false),
                    };
                    let bold_runs: Vec<Run> = runs
                        .iter()
                        .map(|run| Run {
                            text: run.text.clone(),
                            bold: true,
                            italic: run.italic,
                            code: run.code,
                        })
                        .collect();
                    body.push_str(&paragraph_xml(
                        &bold_runs,
                        size,
                        center,
                        None,
                        None,
                        None,
                        false,
                    ));
                }
                ParaStyle::Quote => {
                    body.push_str(&paragraph_xml(
                        runs,
                        "22",
                        false,
                        None,
                        None,
                        None,
                        true,
                    ));
                }
            },
            Block::ListItem {
                runs,
                marker,
                level,
            } => {
                let mut with_marker = vec![Run {
                    text: marker.clone(),
                    bold: false,
                    italic: false,
                    code: false,
                }];
                with_marker.extend(runs.iter().cloned());
                let indent = 360 * (*level as u32).max(1);
                body.push_str(&paragraph_xml(
                    &with_marker,
                    "22",
                    false,
                    None,
                    Some(indent),
                    None,
                    false,
                ));
            }
            Block::Code(code) => {
                for line in code.lines() {
                    let run = Run {
                        text: line.to_string(),
                        bold: false,
                        italic: false,
                        code: true,
                    };
                    body.push_str(&paragraph_xml(
                        &[run],
                        "20",
                        false,
                        None,
                        Some(360),
                        Some("F3F4F6"),
                        false,
                    ));
                }
                body.push_str("<w:p><w:pPr><w:spacing w:after=\"60\"/></w:pPr></w:p>");
            }
            Block::Table { rows } => {
                body.push_str(&table_xml(rows));
            }
            Block::Rule => {
                body.push_str(
                    "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"BFBFBF\"/></w:pBdr></w:pPr></w:p>",
                );
            }
        }
    }

    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
         <w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" \
         xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\
         <w:body>{body}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/>\
         <w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" \
         w:header=\"851\" w:footer=\"992\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>"
    )
}

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"#;

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"#;

const DOCUMENT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="微软雅黑" w:eastAsia="微软雅黑" w:hAnsi="微软雅黑"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
</w:tblBorders></w:tblPr></w:style>
</w:styles>"#;

const APP_PROPS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>pdfmer</Application>
</Properties>"#;

pub fn convert(markdown: &str, title: &str, output: &Path) -> Result<(), String> {
    let blocks = parse_markdown(markdown);
    let document_xml = blocks_to_document_xml(&blocks);
    let core_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\
         <cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" \
         xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" \
         xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\
         <dc:title>{}</dc:title><dc:creator>pdfmer</dc:creator></cp:coreProperties>",
        escape_xml(title)
    );

    let file = File::create(output).map_err(|e| format!("无法创建 Word 文件: {e}"))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    let mut write_part = |name: &str, content: &str, opts: SimpleFileOptions| -> Result<(), String> {
        zip.start_file(name, opts)
            .map_err(|e| format!("写入 Word 文件失败: {e}"))?;
        zip.write_all(content.as_bytes())
            .map_err(|e| format!("写入 Word 文件失败: {e}"))?;
        Ok(())
    };

    write_part("[Content_Types].xml", CONTENT_TYPES, stored)?;
    write_part("_rels/.rels", ROOT_RELS, options)?;
    write_part("word/document.xml", &document_xml, options)?;
    write_part("word/_rels/document.xml.rels", DOCUMENT_RELS, options)?;
    write_part("word/styles.xml", STYLES, options)?;
    write_part("docProps/core.xml", &core_xml, options)?;
    write_part("docProps/app.xml", APP_PROPS, options)?;

    zip.finish().map_err(|e| format!("保存 Word 文件失败: {e}"))?;
    Ok(())
}
