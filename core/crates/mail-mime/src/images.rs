use std::io::Cursor;

use jxl_oxide::{EnumColourEncoding, JxlImage, RenderingIntent};
use tiff::ColorType;
use tiff::decoder::{Decoder, DecodingResult};

const JXL_CODESTREAM: &[u8] = &[0xff, 0x0a];
const JXL_CONTAINER: &[u8] = &[
    0, 0, 0, 0x0c, b'J', b'X', b'L', b' ', 0x0d, 0x0a, 0x87, 0x0a,
];

fn is_jxl(bytes: &[u8]) -> bool {
    bytes.starts_with(JXL_CODESTREAM) || bytes.starts_with(JXL_CONTAINER)
}

pub fn readable_png(bytes: &[u8]) -> Option<Vec<u8>> {
    png_from_jxl(bytes).or_else(|| png_from_tiff(bytes))
}

fn png_from_jxl(bytes: &[u8]) -> Option<Vec<u8>> {
    if !is_jxl(bytes) {
        return None;
    }
    let mut image = JxlImage::builder().read(bytes).ok()?;
    if image.num_loaded_keyframes() == 0 {
        return None;
    }
    image.request_color_encoding(EnumColourEncoding::srgb(RenderingIntent::Relative));
    let render = image.render_frame(0).ok()?;
    let mut stream = render.stream();
    let (width, height, channels) = (stream.width(), stream.height(), stream.channels());
    let mut pixels = vec![0u8; width as usize * height as usize * channels as usize];
    stream.write_to_buffer(&mut pixels);
    encode_png(
        width,
        height,
        color_type(channels)?,
        png::BitDepth::Eight,
        &pixels,
    )
}

fn png_from_tiff(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut decoder = Decoder::new(Cursor::new(bytes)).ok()?;
    let (width, height) = decoder.dimensions().ok()?;
    let (channels, depth) = match decoder.colortype().ok()? {
        ColorType::Gray(depth) => (1, depth),
        ColorType::Multiband {
            bit_depth,
            num_samples: 2,
        } => (2, bit_depth),
        ColorType::RGB(depth) => (3, depth),
        ColorType::RGBA(depth) => (4, depth),
        _ => return None,
    };
    let (depth, pixels) = match (depth, decoder.read_image().ok()?) {
        (1, DecodingResult::U8(pixels)) => (png::BitDepth::One, pixels),
        (8, DecodingResult::U8(pixels)) => (png::BitDepth::Eight, pixels),
        (16, DecodingResult::U16(pixels)) => (
            png::BitDepth::Sixteen,
            pixels
                .iter()
                .flat_map(|sample| sample.to_be_bytes())
                .collect(),
        ),
        _ => return None,
    };
    if depth == png::BitDepth::One && channels != 1 {
        return None;
    }
    encode_png(width, height, color_type(channels)?, depth, &pixels)
}

fn color_type(channels: u32) -> Option<png::ColorType> {
    match channels {
        1 => Some(png::ColorType::Grayscale),
        2 => Some(png::ColorType::GrayscaleAlpha),
        3 => Some(png::ColorType::Rgb),
        4 => Some(png::ColorType::Rgba),
        _ => None,
    }
}

fn encode_png(
    width: u32,
    height: u32,
    color: png::ColorType,
    depth: png::BitDepth,
    pixels: &[u8],
) -> Option<Vec<u8>> {
    let mut encoded = Vec::new();
    let mut encoder = png::Encoder::new(&mut encoded, width, height);
    encoder.set_color(color);
    encoder.set_depth(depth);
    encoder.write_header().ok()?.write_image_data(pixels).ok()?;
    Some(encoded)
}

#[cfg(test)]
#[path = "../../../tests/mail_mime/images.rs"]
mod tests;
