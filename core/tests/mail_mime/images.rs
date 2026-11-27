use base64::Engine;
use zune_core::bit_depth::BitDepth;
use zune_core::colorspace::ColorSpace;
use zune_core::options::EncoderOptions;
use zune_jpegxl::JxlSimpleEncoder;

use super::{png_from_jxl, readable_png};
use crate::render;

fn jxl(pixels: &[u8], width: usize, height: usize, colorspace: ColorSpace) -> Vec<u8> {
    let mut encoded = Vec::new();
    JxlSimpleEncoder::new(
        pixels,
        EncoderOptions::new(width, height, colorspace, BitDepth::Eight),
    )
    .encode(&mut encoded)
    .unwrap();
    encoded
}

fn decode_png(bytes: &[u8]) -> (png::ColorType, u32, u32, Vec<u8>) {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
        .read_info()
        .unwrap();
    let mut buffer = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buffer).unwrap();
    buffer.truncate(info.buffer_size());
    (info.color_type, info.width, info.height, buffer)
}

#[test]
fn turns_a_jpeg_xl_image_into_a_png_with_the_same_pixels_and_transparency() {
    let pixels = [
        255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255,
    ];
    let png = png_from_jxl(&jxl(&pixels, 2, 2, ColorSpace::RGBA)).unwrap();
    assert_eq!(
        decode_png(&png),
        (png::ColorType::Rgba, 2, 2, pixels.to_vec())
    );
}

#[test]
fn keeps_the_shades_of_a_grey_jpeg_xl_image() {
    let pixels = [0, 200, 90, 255];
    let png = png_from_jxl(&jxl(&pixels, 2, 2, ColorSpace::Luma)).unwrap();
    let shades: Vec<u8> = pixels.iter().flat_map(|&shade| [shade; 3]).collect();
    assert_eq!(decode_png(&png), (png::ColorType::Rgb, 2, 2, shades));
}

#[test]
fn leaves_other_images_and_broken_jpeg_xl_alone() {
    assert!(png_from_jxl(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR").is_none());
    assert!(png_from_jxl(&[0xff, 0x0a, 0x00, 0x01]).is_none());
}

#[test]
fn shows_an_inline_jpeg_xl_image_as_a_png() {
    let image = base64::engine::general_purpose::STANDARD.encode(jxl(
        &[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
        2,
        2,
        ColorSpace::RGB,
    ));
    let raw = format!(
        "From: a@example.com\r\nTo: b@example.com\r\nSubject: Photo\r\nMIME-Version: 1.0\r\n\
Content-Type: multipart/related; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
<p>Look</p><img src=\"cid:photo\">\r\n--b\r\nContent-Type: image/jxl\r\nContent-ID: <photo>\r\n\
Content-Transfer-Encoding: base64\r\nContent-Disposition: inline; filename=\"photo.jxl\"\r\n\r\n{image}\r\n--b--\r\n"
    );
    let html = render(raw.as_bytes()).unwrap().html.unwrap();
    assert!(html.contains("src=\"data:image/png;base64,"), "{html}");
    assert!(!html.contains("image/jxl"));
}

fn rgb_tiff(pixels: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut encoded = std::io::Cursor::new(Vec::new());
    tiff::encoder::TiffEncoder::new(&mut encoded)
        .unwrap()
        .write_image::<tiff::encoder::colortype::RGB8>(width, height, pixels)
        .unwrap();
    encoded.into_inner()
}

fn bilevel_tiff(width: u16, rows: &[u8]) -> Vec<u8> {
    let height = rows.len() as u16;
    let entries: [(u16, u16, u32); 8] = [
        (256, 3, width as u32),
        (257, 3, height as u32),
        (258, 3, 1),
        (259, 3, 1),
        (262, 3, 0),
        (273, 4, 8 + 2 + 8 * 12 + 4),
        (278, 3, height as u32),
        (279, 4, rows.len() as u32),
    ];
    let mut bytes = b"II*\0".to_vec();
    bytes.extend(8u32.to_le_bytes());
    bytes.extend((entries.len() as u16).to_le_bytes());
    for (tag, kind, value) in entries {
        bytes.extend(tag.to_le_bytes());
        bytes.extend(kind.to_le_bytes());
        bytes.extend(1u32.to_le_bytes());
        bytes.extend(value.to_le_bytes());
    }
    bytes.extend(0u32.to_le_bytes());
    bytes.extend(rows);
    bytes
}

#[test]
fn turns_a_tiff_scan_into_a_png_with_the_same_pixels() {
    let pixels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    let png = readable_png(&rgb_tiff(&pixels, 2, 2)).unwrap();
    assert_eq!(
        decode_png(&png),
        (png::ColorType::Rgb, 2, 2, pixels.to_vec())
    );
}

#[test]
fn keeps_the_depth_of_a_16_bit_grey_tiff() {
    let mut encoded = std::io::Cursor::new(Vec::new());
    tiff::encoder::TiffEncoder::new(&mut encoded)
        .unwrap()
        .write_image::<tiff::encoder::colortype::Gray16>(2, 1, &[0x0102, 0xfffe])
        .unwrap();
    let png = readable_png(&encoded.into_inner()).unwrap();
    assert_eq!(
        decode_png(&png),
        (
            png::ColorType::Grayscale,
            2,
            1,
            vec![0x01, 0x02, 0xff, 0xfe]
        )
    );
}

#[test]
fn shows_a_fax_with_black_ink_on_white_paper() {
    let png = readable_png(&bilevel_tiff(2, &[0b1000_0000, 0b0100_0000])).unwrap();
    let (color, width, height, rows) = decode_png(&png);
    assert_eq!((color, width, height), (png::ColorType::Grayscale, 2, 2));
    assert_eq!(
        rows.iter().map(|row| row & 0b1100_0000).collect::<Vec<_>>(),
        [0b0100_0000, 0b1000_0000]
    );
}

#[test]
fn leaves_images_that_need_no_conversion_alone() {
    assert!(readable_png(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR").is_none());
    assert!(readable_png(b"II*\0\x08\0\0\0").is_none());
}

#[test]
fn shows_an_inline_tiff_image_as_a_png() {
    let image = base64::engine::general_purpose::STANDARD.encode(rgb_tiff(&[200; 12], 2, 2));
    let raw = format!(
        "From: a@example.com\r\nTo: b@example.com\r\nSubject: Scan\r\nMIME-Version: 1.0\r\n\
Content-Type: multipart/related; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
<p>Scan</p><img src=\"cid:scan\">\r\n--b\r\nContent-Type: image/tiff\r\nContent-ID: <scan>\r\n\
Content-Transfer-Encoding: base64\r\nContent-Disposition: inline; filename=\"scan.tif\"\r\n\r\n{image}\r\n--b--\r\n"
    );
    let html = render(raw.as_bytes()).unwrap().html.unwrap();
    assert!(html.contains("src=\"data:image/png;base64,"), "{html}");
    assert!(!html.contains("image/tiff"));
}
