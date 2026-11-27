use base64::Engine;
use zune_core::bit_depth::BitDepth;
use zune_core::colorspace::ColorSpace;
use zune_core::options::EncoderOptions;
use zune_jpegxl::JxlSimpleEncoder;

use super::png_from_jxl;
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
