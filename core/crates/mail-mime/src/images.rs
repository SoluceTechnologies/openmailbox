use jxl_oxide::{EnumColourEncoding, JxlImage, RenderingIntent};

const JXL_CODESTREAM: &[u8] = &[0xff, 0x0a];
const JXL_CONTAINER: &[u8] = &[
    0, 0, 0, 0x0c, b'J', b'X', b'L', b' ', 0x0d, 0x0a, 0x87, 0x0a,
];

fn is_jxl(bytes: &[u8]) -> bool {
    bytes.starts_with(JXL_CODESTREAM) || bytes.starts_with(JXL_CONTAINER)
}

pub fn png_from_jxl(bytes: &[u8]) -> Option<Vec<u8>> {
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
    let color_type = match channels {
        1 => png::ColorType::Grayscale,
        2 => png::ColorType::GrayscaleAlpha,
        3 => png::ColorType::Rgb,
        4 => png::ColorType::Rgba,
        _ => return None,
    };
    let mut pixels = vec![0u8; width as usize * height as usize * channels as usize];
    stream.write_to_buffer(&mut pixels);
    let mut encoded = Vec::new();
    let mut encoder = png::Encoder::new(&mut encoded, width, height);
    encoder.set_color(color_type);
    encoder.set_depth(png::BitDepth::Eight);
    encoder
        .write_header()
        .ok()?
        .write_image_data(&pixels)
        .ok()?;
    Some(encoded)
}

#[cfg(test)]
#[path = "../../../tests/mail_mime/images.rs"]
mod tests;
