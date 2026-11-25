use std::borrow::Cow;
use std::ops::Range;

use base64::Engine;
use base64::alphabet;
use base64::engine::general_purpose::STANDARD;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use mail_parser::{Charset, Message, MessageParser, MessagePart};

use crate::code_pages::code_page;

const LENIENT_BASE64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

const ALIASES: &[(&str, &str)] = &[
    ("cp932", "windows-31j"),
    ("x-ms-cp932", "windows-31j"),
    ("shift_jisx0213", "shift_jis"),
    ("eucjp", "euc-jp"),
    ("euc-jisx0213", "euc-jp"),
    ("iso-2022-jp-1", "iso-2022-jp"),
    ("iso-2022-jp-2", "iso-2022-jp"),
    ("iso-2022-jp-3", "iso-2022-jp"),
    ("csiso2022jp2", "iso-2022-jp"),
    ("euc-cn", "gb2312"),
    ("x-euc-cn", "gb2312"),
    ("cp950", "big5"),
    ("windows-950", "big5"),
    ("big5hkscs", "big5-hkscs"),
    ("euckr", "euc-kr"),
    ("ks_c_5601", "euc-kr"),
    ("cp874", "windows-874"),
    ("tis620", "tis-620"),
    ("koi8r", "koi8-r"),
    ("unicode-1-1-utf-7", "utf-7"),
    ("x-unicode20utf7", "utf-7"),
];

const FALLBACK_LABEL: &str = "windows-1252";

fn alias(label: &str) -> Option<&'static str> {
    ALIASES
        .iter()
        .find(|(alias, _)| alias.eq_ignore_ascii_case(label))
        .map(|(_, canonical)| *canonical)
}

fn canonical(label: &str) -> &str {
    let label = label.trim().trim_matches('"');
    alias(label).unwrap_or(label)
}

fn charset(label: &str) -> Option<Charset> {
    Charset::from_label(canonical(label).as_bytes())
}

#[derive(Clone, Copy, PartialEq)]
enum Decoder {
    Parser(Charset),
    Iso2022Kr,
    Hz,
    CodePage(&'static [u16; 128]),
}

fn decoder(label: &str) -> Option<Decoder> {
    let label = canonical(label).to_ascii_lowercase();
    match Charset::from_label(label.as_bytes()) {
        Some(Charset::Replacement) | None => match label.as_str() {
            "iso-2022-kr" | "csiso2022kr" => Some(Decoder::Iso2022Kr),
            "hz-gb-2312" => Some(Decoder::Hz),
            _ => [
                "x-ibm",
                "ibm-",
                "ibm",
                "cp-",
                "cp",
                "cspc8codepage",
                "cspcp",
                "",
            ]
            .iter()
            .find_map(|prefix| label.strip_prefix(prefix)?.parse().ok())
            .and_then(code_page)
            .map(Decoder::CodePage),
        },
        Some(charset) => Some(Decoder::Parser(charset)),
    }
}

impl Decoder {
    fn decode(self, bytes: &[u8]) -> Cow<'_, str> {
        match self {
            Decoder::Parser(charset) => charset.decode(bytes),
            Decoder::Iso2022Kr => {
                Cow::Owned(Charset::EucKr.decode(&iso_2022_kr(bytes)).into_owned())
            }
            Decoder::Hz => Cow::Owned(Charset::Gbk.decode(&hz(bytes)).into_owned()),
            Decoder::CodePage(table) => Cow::Owned(
                bytes
                    .iter()
                    .map(|&byte| match byte {
                        0..=0x7f => byte as char,
                        _ => {
                            char::from_u32(table[byte as usize - 0x80].into()).unwrap_or('\u{fffd}')
                        }
                    })
                    .collect(),
            ),
        }
    }
}

fn iso_2022_kr(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut shifted = false;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            0x1b if bytes[index..].starts_with(b"\x1b$)C") => index += 3,
            0x0e => shifted = true,
            0x0f => shifted = false,
            byte @ (b'\r' | b'\n') => {
                shifted = false;
                out.push(byte);
            }
            byte @ 0x21..=0x7e if shifted => out.push(byte | 0x80),
            byte => out.push(byte),
        }
        index += 1;
    }
    out
}

fn hz(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut gb = false;
    let mut index = 0;
    while index < bytes.len() {
        match (bytes[index], bytes.get(index + 1)) {
            (b'~', Some(b'~')) if !gb => out.push(b'~'),
            (b'~', Some(b'{')) => gb = true,
            (b'~', Some(b'}')) => gb = false,
            (b'~', Some(b'\n')) => {}
            (byte @ (b'\r' | b'\n'), _) => {
                gb = false;
                out.push(byte);
                index += 1;
                continue;
            }
            (byte @ 0x21..=0x7e, _) if gb => {
                out.push(byte | 0x80);
                index += 1;
                continue;
            }
            (byte, _) => {
                out.push(byte);
                index += 1;
                continue;
            }
        }
        index += 2;
    }
    out
}

pub(crate) fn parse(raw: &[u8]) -> Option<Message<'_>> {
    let message = MessageParser::default().parse(raw)?;
    match repaired(&message) {
        Some(raw) => MessageParser::default().parse_owned(raw),
        None => Some(message),
    }
}

fn repaired(message: &Message) -> Option<Vec<u8>> {
    let raw = message.raw();
    let mut fixed = Vec::new();
    let mut copied = 0;
    for part in message.root().parts() {
        let block = part.offset_header() as usize..part.offset_body() as usize;
        let Some(headers) = raw.get(block.clone()).filter(|_| block.start >= copied) else {
            continue;
        };
        let body = utf8_body(&part);
        let repaired = repaired_headers(headers, &part, message, body.is_some());
        if repaired.is_none() && body.is_none() {
            continue;
        }
        fixed.extend_from_slice(&raw[copied..block.start]);
        fixed.extend_from_slice(repaired.as_deref().map_or(headers, str::as_bytes));
        copied = block.end;
        if let Some(body) = body {
            fixed.extend_from_slice(body.as_bytes());
            copied = part.offset_end() as usize;
        }
    }
    (copied > 0).then(|| {
        fixed.extend_from_slice(&raw[copied..]);
        fixed
    })
}

fn fallback_label<'m>(message: &'m Message) -> &'m str {
    message
        .root()
        .parts()
        .filter_map(|part| part.content_type()?.attribute("charset"))
        .find(|label| {
            charset(label).is_some_and(|charset| {
                !matches!(
                    charset,
                    Charset::Utf8
                        | Charset::Utf7
                        | Charset::Utf16
                        | Charset::Utf16Le
                        | Charset::Utf16Be
                        | Charset::Replacement
                        | Charset::XUserDefined
                )
            })
        })
        .map_or(FALLBACK_LABEL, canonical)
}

fn utf8_body(part: &MessagePart) -> Option<String> {
    let label = part.content_type()?.attribute("charset")?;
    let decoder = decoder(label).filter(|decoder| !matches!(decoder, Decoder::Parser(_)))?;
    part.is_text()
        .then(|| decoder.decode(&part.decoded()).into_owned())
}

fn repaired_headers(
    headers: &[u8],
    part: &MessagePart,
    message: &Message,
    utf8_body: bool,
) -> Option<String> {
    let text = match std::str::from_utf8(headers) {
        Ok(text) if !text.contains('\u{1b}') => Cow::Borrowed(text),
        Ok(_) => Charset::Iso2022Jp.decode(headers),
        Err(_) => match charset(fallback_label(message)) {
            Some(Charset::Iso2022Jp) => Charset::ShiftJis.decode(headers),
            other => other.unwrap_or(Charset::Windows1252).decode(headers),
        },
    };
    let text = utf8_words(&text);
    let text = if utf8_body {
        let text = relabeled(&text, |_| Some("utf-8"));
        match field(&text, "content-transfer-encoding") {
            Some(value) => Cow::Owned(format!(
                "{} 8bit{}",
                &text[..value.start],
                &text[value.end..]
            )),
            None => text,
        }
    } else {
        relabeled(&text, |label| {
            alias(label).filter(|canonical| {
                Charset::from_label(label.as_bytes()).is_none()
                    && Charset::from_label(canonical.as_bytes()).is_some()
            })
        })
    };
    let text = match body_charset(part, message) {
        Some(label) if !utf8_body => Cow::Owned(with_charset(&text, &label)),
        _ => text,
    };
    (text.as_bytes() != headers).then(|| text.into_owned())
}

struct Word {
    range: Range<usize>,
    decoder: Decoder,
    bytes: Vec<u8>,
}

fn words_to_rewrite(text: &str) -> Vec<Word> {
    let mut words = Vec::new();
    let mut from = 0;
    while let Some(at) = text[from..].find("=?").map(|at| from + at) {
        from = at + 2;
        let rest = &text[from..];
        let Some((label, rest)) = rest.split_once('?') else {
            break;
        };
        let Some((encoding, rest)) = rest.split_once('?') else {
            break;
        };
        let Some(end) = rest.find("?=") else { break };
        let payload = &rest[..end];
        let label = label.split('*').next().unwrap_or_default();
        if label.is_empty()
            || label.contains(char::is_whitespace)
            || payload.contains(char::is_whitespace)
        {
            continue;
        }
        let known = Charset::from_label(label.as_bytes());
        if known
            .is_some_and(|charset| !matches!(charset, Charset::Iso2022Jp | Charset::Replacement))
        {
            continue;
        }
        let Some(decoder) = decoder(label) else {
            continue;
        };
        let bytes = match encoding {
            "B" | "b" => LENIENT_BASE64.decode(payload).unwrap_or_default(),
            "Q" | "q" => q_decode(payload),
            _ => continue,
        };
        let range = at..text.len() - rest.len() + end + 2;
        from = range.end;
        words.push(Word {
            range,
            decoder,
            bytes,
        });
    }
    words
}

fn utf8_words(text: &str) -> Cow<'_, str> {
    let words = words_to_rewrite(text);
    if words.is_empty() {
        return Cow::Borrowed(text);
    }
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut index = 0;
    while index < words.len() {
        let start = words[index].range.start;
        let decoder = words[index].decoder;
        let mut bytes = words[index].bytes.clone();
        let mut end = words[index].range.end;
        while let Some(next) = words
            .get(index + 1)
            .filter(|next| next.decoder == decoder && text[end..next.range.start].trim().is_empty())
        {
            bytes.extend_from_slice(&next.bytes);
            end = next.range.end;
            index += 1;
        }
        if decoder == Decoder::Parser(Charset::Iso2022Jp) {
            bytes = without_redundant_escapes(&bytes);
        }
        out.push_str(&text[copied..start]);
        out.push_str("=?UTF-8?B?");
        out.push_str(&STANDARD.encode(decoder.decode(&bytes).as_bytes()));
        out.push_str("?=");
        copied = end;
        index += 1;
    }
    out.push_str(&text[copied..]);
    Cow::Owned(out)
}

fn q_decode(payload: &str) -> Vec<u8> {
    let bytes = payload.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let escaped = (bytes[index] == b'=')
            .then(|| bytes.get(index + 1..index + 3))
            .flatten()
            .and_then(|hex| u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok());
        match (escaped, bytes[index]) {
            (Some(byte), _) => {
                out.push(byte);
                index += 3;
            }
            (None, b'_') => {
                out.push(b' ');
                index += 1;
            }
            (None, byte) => {
                out.push(byte);
                index += 1;
            }
        }
    }
    out
}

fn without_redundant_escapes(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == 0x1b && bytes.get(index + 3) == Some(&0x1b) {
            index += 3;
            continue;
        }
        out.push(bytes[index]);
        index += 1;
    }
    out
}

fn relabeled<'t>(text: &'t str, label_for: impl Fn(&str) -> Option<&'t str>) -> Cow<'t, str> {
    let mut out = String::new();
    let mut copied = 0;
    let bytes = text.as_bytes();
    let found = (7..bytes.len())
        .filter(|at| bytes[*at] == b'=' && bytes[at - 7..*at].eq_ignore_ascii_case(b"charset"));
    for at in found {
        let start = at + 1;
        let value = text[start..].trim_start_matches('"');
        let start = text.len() - value.len();
        let end = start
            + value
                .find(['"', ';', ' ', '\t', '\r', '\n'])
                .unwrap_or(value.len());
        let Some(label) = label_for(&text[start..end]) else {
            continue;
        };
        out.push_str(&text[copied..start]);
        out.push_str(label);
        copied = end;
    }
    if copied == 0 {
        return Cow::Borrowed(text);
    }
    out.push_str(&text[copied..]);
    Cow::Owned(out)
}

fn body_charset(part: &MessagePart, message: &Message) -> Option<String> {
    let declared = part
        .content_type()
        .is_some_and(|content_type| content_type.attribute("charset").is_some());
    if declared || !part.is_text() {
        return None;
    }
    let body = part.decoded();
    if let Err(error) = std::str::from_utf8(&body)
        && error.error_len().is_some()
    {
        let meta = part
            .is_content_type("text", "html")
            .then(|| meta_charset(&body));
        return Some(meta.flatten().unwrap_or(fallback_label(message)).to_owned());
    }
    None
}

fn meta_charset(html: &[u8]) -> Option<&str> {
    let head = &html[..html.len().min(1024)];
    let at = head
        .windows(8)
        .position(|window| window.eq_ignore_ascii_case(b"charset="))?;
    let value = &head[at + 8..];
    let value = value
        .strip_prefix(b"\"")
        .or_else(|| value.strip_prefix(b"'"))
        .unwrap_or(value);
    let end = value
        .iter()
        .position(|byte| !(byte.is_ascii_alphanumeric() || b"-_:.".contains(byte)))
        .unwrap_or(value.len());
    std::str::from_utf8(&value[..end])
        .ok()
        .filter(|label| charset(label).is_some())
}

fn field(headers: &str, name: &str) -> Option<Range<usize>> {
    let mut value: Option<Range<usize>> = None;
    let mut offset = 0;
    for line in headers.split_inclusive('\n') {
        let end = offset + line.trim_end_matches(['\r', '\n']).len();
        match &mut value {
            Some(value) if line.starts_with([' ', '\t']) => value.end = end,
            Some(_) => break,
            None if line.as_bytes().get(name.len()) == Some(&b':')
                && line.as_bytes()[..name.len()].eq_ignore_ascii_case(name.as_bytes()) =>
            {
                value = Some(offset + name.len() + 1..end);
            }
            None => {}
        }
        offset += line.len();
    }
    value
}

fn with_charset(headers: &str, label: &str) -> String {
    match field(headers, "content-type") {
        Some(value) => format!(
            "{}; charset={label}{}",
            &headers[..value.end],
            &headers[value.end..]
        ),
        None => format!("Content-Type: text/plain; charset={label}\r\n{headers}"),
    }
}

#[cfg(test)]
#[path = "../../../tests/mail_mime/charsets.rs"]
mod tests;
