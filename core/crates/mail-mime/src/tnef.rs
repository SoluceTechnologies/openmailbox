use crate::charsets::decode_code_page;

const SIGNATURE: u32 = 0x223e_9f78;
const OEM_CODE_PAGE: u32 = 0x0006_9007;
const SUBJECT: u32 = 0x0001_8004;
const ATTACH_REND_DATA: u32 = 0x0006_9002;
const ATTACH_TITLE: u32 = 0x0001_8010;
const ATTACH_DATA: u32 = 0x0006_800f;
const ATTACHMENT: u32 = 0x0006_9005;
const ATTACH_DATA_BINARY: u16 = 0x3701;
const ATTACH_LONG_FILENAME: u16 = 0x3707;
const ATTACH_MIME_TAG: u16 = 0x370e;
const MULTIPLE_VALUES: u16 = 0x1000;
const STRING8: u16 = 0x001e;
const UNICODE: u16 = 0x001f;
const BINARY: u16 = 0x0102;

pub(crate) struct TnefFile {
    pub filename: String,
    pub mime_type: Option<String>,
    pub data: Vec<u8>,
}

pub(crate) struct Tnef {
    pub subject: Option<String>,
    pub files: Vec<TnefFile>,
}

#[derive(Default)]
struct Part<'a> {
    title: Option<String>,
    long_filename: Option<String>,
    mime_type: Option<String>,
    data: Option<&'a [u8]>,
}

struct Reader<'a>(&'a [u8]);

impl<'a> Reader<'a> {
    fn take(&mut self, length: usize) -> Option<&'a [u8]> {
        if self.0.len() < length {
            return None;
        }
        let (head, tail) = self.0.split_at(length);
        self.0 = tail;
        Some(head)
    }

    fn u16(&mut self) -> Option<u16> {
        Some(u16::from_le_bytes(self.take(2)?.try_into().ok()?))
    }

    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    fn padded(&mut self, length: usize) -> Option<&'a [u8]> {
        let value = self.take(length)?;
        self.take(length.next_multiple_of(4) - length)?;
        Some(value)
    }
}

fn string8(bytes: &[u8], code_page: u32) -> String {
    decode_code_page(
        code_page,
        bytes.split(|&byte| byte == 0).next().unwrap_or_default(),
    )
}

fn unicode(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&pair| u16::from_le_bytes(pair))
        .take_while(|&unit| unit != 0)
        .collect();
    String::from_utf16_lossy(&units)
}

fn properties<'a>(data: &'a [u8], code_page: u32, part: &mut Part<'a>) -> Option<()> {
    let mut reader = Reader(data);
    for _ in 0..reader.u32()? {
        let kind = reader.u16()?;
        let id = reader.u16()?;
        if id >= 0x8000 {
            reader.take(16)?;
            if reader.u32()? == 0 {
                reader.u32()?;
            } else {
                let length = reader.u32()? as usize;
                reader.padded(length)?;
            }
        }
        let base = kind & !MULTIPLE_VALUES;
        let fixed = match base {
            0x0001..=0x0004 | 0x000a | 0x000b => Some(4),
            0x0005..=0x0007 | 0x0014 | 0x0040 => Some(8),
            0x0048 => Some(16),
            _ => None,
        };
        if let Some(size) = fixed {
            let count = if kind & MULTIPLE_VALUES != 0 {
                reader.u32()?
            } else {
                1
            };
            reader.take(size * count as usize)?;
            continue;
        }
        for _ in 0..reader.u32()? {
            let length = reader.u32()? as usize;
            let value = reader.padded(length)?;
            let text = match base {
                STRING8 => Some(string8(value, code_page)),
                UNICODE => Some(unicode(value)),
                _ => None,
            };
            match id {
                ATTACH_LONG_FILENAME => part.long_filename = text.or(part.long_filename.take()),
                ATTACH_MIME_TAG => part.mime_type = text.map(|text| text.to_ascii_lowercase()),
                ATTACH_DATA_BINARY if base == BINARY && part.data.is_none() => {
                    part.data = Some(value)
                }
                _ => {}
            }
        }
    }
    Some(())
}

pub(crate) fn read(raw: &[u8]) -> Option<Tnef> {
    let mut reader = Reader(raw);
    if reader.u32()? != SIGNATURE {
        return None;
    }
    reader.u16()?;
    let mut code_page = 1252;
    let mut subject = None;
    let mut parts: Vec<Part> = Vec::new();
    while let Some(level) = reader.take(1) {
        let (Some(id), Some(length)) = (reader.u32(), reader.u32()) else {
            break;
        };
        let (Some(data), Some(_checksum)) = (reader.take(length as usize), reader.u16()) else {
            break;
        };
        match (level[0], id, parts.last_mut()) {
            (1, OEM_CODE_PAGE, _) if data.len() >= 4 => {
                code_page = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            }
            (1, SUBJECT, _) => subject = Some(string8(data, code_page)),
            (2, ATTACH_REND_DATA, _) => parts.push(Part::default()),
            (2, ATTACH_TITLE, Some(part)) => part.title = Some(string8(data, code_page)),
            (2, ATTACH_DATA, Some(part)) => part.data = Some(data),
            (2, ATTACHMENT, Some(part)) => {
                properties(data, code_page, part);
            }
            _ => {}
        }
    }
    let files = parts
        .into_iter()
        .filter_map(|part| {
            let filename = part
                .long_filename
                .into_iter()
                .chain(part.title)
                .find(|name| !name.trim().is_empty())?;
            Some(TnefFile {
                filename,
                mime_type: part.mime_type.filter(|mime_type| mime_type.contains('/')),
                data: part.data?.to_vec(),
            })
        })
        .collect();
    Some(Tnef { subject, files })
}

pub(crate) fn guessed_mime_type(filename: &str) -> &'static str {
    let extension = filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "rtf" => "application/rtf",
        "zip" => "application/zip",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "tif" | "tiff" => "image/tiff",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "htm" | "html" => "text/html",
        "ics" => "text/calendar",
        "vcf" => "text/vcard",
        "eml" => "message/rfc822",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
#[path = "../../../tests/mail_mime/tnef.rs"]
mod tests;
