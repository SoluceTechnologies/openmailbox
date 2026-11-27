use crate::{attachment, read_message};

const REND_DATA: [u8; 14] = [1, 0, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0];

fn attribute(level: u8, id: u32, data: &[u8]) -> Vec<u8> {
    let mut bytes = vec![level];
    bytes.extend(id.to_le_bytes());
    bytes.extend((data.len() as u32).to_le_bytes());
    bytes.extend(data);
    let checksum = data
        .iter()
        .fold(0u16, |sum, &byte| sum.wrapping_add(byte.into()));
    bytes.extend(checksum.to_le_bytes());
    bytes
}

fn padded(bytes: &[u8]) -> Vec<u8> {
    let mut padded = bytes.to_vec();
    padded.resize(bytes.len().div_ceil(4) * 4, 0);
    padded
}

fn utf16(text: &str) -> Vec<u8> {
    text.encode_utf16()
        .chain([0])
        .flat_map(u16::to_le_bytes)
        .collect()
}

fn variable_property(kind: u16, id: u16, value: &[u8]) -> Vec<u8> {
    let mut bytes = kind.to_le_bytes().to_vec();
    bytes.extend(id.to_le_bytes());
    bytes.extend(1u32.to_le_bytes());
    bytes.extend((value.len() as u32).to_le_bytes());
    bytes.extend(padded(value));
    bytes
}

fn properties() -> Vec<u8> {
    let mut bytes = 4u32.to_le_bytes().to_vec();
    bytes.extend(0x0003u16.to_le_bytes());
    bytes.extend(0x3705u16.to_le_bytes());
    bytes.extend(1u32.to_le_bytes());
    bytes.extend(0x001fu16.to_le_bytes());
    bytes.extend(0x8001u16.to_le_bytes());
    bytes.extend([7; 16]);
    bytes.extend(1u32.to_le_bytes());
    let name = utf16("Keywords");
    bytes.extend((name.len() as u32).to_le_bytes());
    bytes.extend(padded(&name));
    bytes.extend(1u32.to_le_bytes());
    let value = utf16("Q3");
    bytes.extend((value.len() as u32).to_le_bytes());
    bytes.extend(padded(&value));
    bytes.extend(variable_property(
        0x001f,
        0x3707,
        &utf16("Quarterly report é.pdf"),
    ));
    bytes.extend(variable_property(0x001e, 0x370e, b"Application/PDF\0"));
    bytes
}

fn winmail(files: bool) -> Vec<u8> {
    let mut bytes = 0x223e_9f78u32.to_le_bytes().to_vec();
    bytes.extend(0x0101u16.to_le_bytes());
    bytes.extend(attribute(1, 0x0008_9006, &[0, 0, 1, 0]));
    bytes.extend(attribute(1, 0x0006_9007, &[0xe4, 0x04, 0, 0, 0, 0, 0, 0]));
    bytes.extend(attribute(1, 0x0001_8004, b"Rapport T3 \xe9t\xe9\0"));
    bytes.extend(attribute(1, 0x0006_9003, &[0, 0, 0, 0]));
    if files {
        bytes.extend(attribute(2, 0x0006_9002, &REND_DATA));
        bytes.extend(attribute(2, 0x0001_8010, b"QUARTE~1.PDF\0"));
        bytes.extend(attribute(2, 0x0006_800f, b"%PDF-1.7"));
        bytes.extend(attribute(2, 0x0006_9005, &properties()));
        bytes.extend(attribute(2, 0x0006_9002, &REND_DATA));
        bytes.extend(attribute(2, 0x0001_8010, b"notes.txt\0"));
        bytes.extend(attribute(2, 0x0006_800f, b"call Paul"));
    }
    bytes
}

#[test]
fn lists_the_files_inside_an_outlook_winmail_dat() {
    let message = read_message(&winmail(true)).unwrap();
    assert_eq!(message.subject, "Rapport T3 été");
    assert!(message.from.is_empty());
    let files: Vec<_> = message
        .body
        .attachments
        .iter()
        .map(|file| {
            (
                file.index,
                file.filename.as_str(),
                file.mime_type.as_str(),
                file.size,
            )
        })
        .collect();
    assert_eq!(
        files,
        [
            (0, "Quarterly report é.pdf", "application/pdf", 8),
            (1, "notes.txt", "text/plain", 9),
        ]
    );
}

#[test]
fn extracts_a_file_from_an_outlook_winmail_dat() {
    let raw = winmail(true);
    assert_eq!(
        attachment(&raw, 0),
        Some(("Quarterly report é.pdf".to_owned(), b"%PDF-1.7".to_vec()))
    );
    assert_eq!(
        attachment(&raw, 1),
        Some(("notes.txt".to_owned(), b"call Paul".to_vec()))
    );
    assert_eq!(attachment(&raw, 2), None);
}

#[test]
fn finds_nothing_to_show_in_a_winmail_dat_without_files() {
    assert!(read_message(&winmail(false)).is_err());
}

#[test]
fn keeps_the_files_read_before_a_damaged_part() {
    let mut raw = winmail(true);
    raw.truncate(raw.len() - 4);
    let message = read_message(&raw).unwrap();
    assert_eq!(message.body.attachments.len(), 1);
}
