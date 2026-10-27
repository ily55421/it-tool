use std::fs;
use std::io::{Cursor, Write};
use std::path::Path;

use base64::Engine;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};

pub fn load_and_rotate(bytes: &[u8], rotation: f64) -> Result<DynamicImage, String> {
    let image = image::load_from_memory(bytes).map_err(|e| format!("无法识别图片: {e}"))?;
    Ok(rotate_image(image, rotation))
}

pub fn rotate_image(image: DynamicImage, rotation: f64) -> DynamicImage {
    let angle = rotation % 360.0;
    if angle.abs() < 0.01 {
        return image;
    }
    let rgba = image.to_rgba8();
    let normalized = angle.rem_euclid(360.0);

    // PIL's rotate() is counter-clockwise; image's rotate90 is clockwise.
    if (normalized - 90.0).abs() < 0.01 {
        return DynamicImage::ImageRgba8(image::imageops::rotate270(&rgba));
    }
    if (normalized - 180.0).abs() < 0.01 {
        return DynamicImage::ImageRgba8(image::imageops::rotate180(&rgba));
    }
    if (normalized - 270.0).abs() < 0.01 {
        return DynamicImage::ImageRgba8(image::imageops::rotate90(&rgba));
    }

    let (width, height) = rgba.dimensions();
    let radians = normalized.to_radians();
    let (sin, cos) = radians.sin_cos();
    let new_width = (width as f64 * cos.abs() + height as f64 * sin.abs()).ceil() as u32;
    let new_height = (width as f64 * sin.abs() + height as f64 * cos.abs()).ceil() as u32;
    let mut output = RgbaImage::new(new_width.max(1), new_height.max(1));

    let src_cx = width as f64 / 2.0;
    let src_cy = height as f64 / 2.0;
    let dst_cx = new_width as f64 / 2.0;
    let dst_cy = new_height as f64 / 2.0;

    for y in 0..new_height {
        for x in 0..new_width {
            let dx = x as f64 + 0.5 - dst_cx;
            let dy = y as f64 + 0.5 - dst_cy;
            let sx = cos * dx + sin * dy + src_cx;
            let sy = -sin * dx + cos * dy + src_cy;
            output.put_pixel(x, y, sample_bilinear(&rgba, sx - 0.5, sy - 0.5));
        }
    }

    DynamicImage::ImageRgba8(output)
}

fn sample_bilinear(image: &RgbaImage, x: f64, y: f64) -> Rgba<u8> {
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Rgba([255, 255, 255, 255]);
    }
    let max_x = width as f64 - 1.0;
    let max_y = height as f64 - 1.0;
    let x = x.max(0.0).min(max_x);
    let y = y.max(0.0).min(max_y);

    let x0 = x.floor() as u32;
    let y0 = y.floor() as u32;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    let fx = x - x0 as f64;
    let fy = y - y0 as f64;

    let p00 = image.get_pixel(x0, y0);
    let p10 = image.get_pixel(x1, y0);
    let p01 = image.get_pixel(x0, y1);
    let p11 = image.get_pixel(x1, y1);

    let lerp = |a: f64, b: f64, t: f64| -> f64 { a + (b - a) * t };
    let mut out = [0u8; 4];
    for i in 0..4 {
        let top = lerp(p00[i] as f64, p10[i] as f64, fx);
        let bottom = lerp(p01[i] as f64, p11[i] as f64, fx);
        out[i] = lerp(top, bottom, fy).round().clamp(0.0, 255.0) as u8;
    }
    Rgba(out)
}

pub fn preview_data_uri(image: &DynamicImage) -> Result<(String, u32, u32), String> {
    let mut png = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|e| format!("预览图编码失败: {e}"))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png);
    Ok((
        format!("data:image/png;base64,{encoded}"),
        image.width(),
        image.height(),
    ))
}

pub fn convert_to_pdf(bytes: &[u8], rotation: f64, output: &Path) -> Result<(), String> {
    let image = load_and_rotate(bytes, rotation)?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸无效".to_string());
    }

    let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
    for pixel in rgba.pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        for channel in 0..3 {
            rgb.push((pixel[channel] as f32 * alpha + 255.0 * (1.0 - alpha)) as u8);
        }
    }

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&rgb)
        .map_err(|e| format!("图片压缩失败: {e}"))?;
    let compressed = encoder
        .finish()
        .map_err(|e| format!("图片压缩失败: {e}"))?;

    // A4 width in points; the page height follows the image aspect ratio.
    let page_width = 595.28f64;
    let page_height = page_width * height as f64 / width as f64;
    let content = format!(
        "q\n{page_width:.4} 0 0 {page_height:.4} 0 0 cm\n/Im0 Do\nQ\n"
    );

    let mut pdf: Vec<u8> = Vec::new();
    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let mut offsets: Vec<usize> = Vec::with_capacity(5);

    let object = |pdf: &mut Vec<u8>, body: &[u8], offsets: &mut Vec<usize>| {
        offsets.push(pdf.len());
        pdf.extend_from_slice(body);
    };

    object(
        &mut pdf,
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        &mut offsets,
    );
    object(
        &mut pdf,
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        &mut offsets,
    );
    let page = format!(
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width:.4} {page_height:.4}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n"
    );
    object(&mut pdf, page.as_bytes(), &mut offsets);
    let content_object = format!(
        "4 0 obj\n<< /Length {} >>\nstream\n{content}endstream\nendobj\n",
        content.len()
    );
    object(&mut pdf, content_object.as_bytes(), &mut offsets);
    let image_header = format!(
        "5 0 obj\n<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length {} >>\nstream\n",
        compressed.len()
    );
    object(&mut pdf, image_header.as_bytes(), &mut offsets);
    pdf.extend_from_slice(&compressed);
    pdf.extend_from_slice(b"\nendstream\nendobj\n");

    let xref_offset = pdf.len();
    pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
    for offset in &offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        )
        .as_bytes(),
    );

    fs::write(output, pdf).map_err(|e| format!("保存 PDF 失败: {e}"))?;
    Ok(())
}
