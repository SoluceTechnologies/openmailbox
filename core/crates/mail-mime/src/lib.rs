use std::collections::HashSet;
use std::sync::LazyLock;

use base64::Engine;
use lettre::message::header::ContentType;
use lettre::message::{Mailbox as LettreMailbox, MessageBuilder};
use mail_model::{Address, Attachment, Error, ParsedHeaders, RenderedBody, Result};
use mail_parser::{AddressList, Message, MessageParser};

const PREVIEW_LENGTH: usize = 180;
const INLINE_IMAGE_LIMIT: usize = 2 * 1024 * 1024;

static SANITIZER: LazyLock<ammonia::Builder<'static>> = LazyLock::new(|| {
    let mut builder = ammonia::Builder::default();
    builder
        .add_tags(["style", "center", "font", "span", "div"])
        .rm_clean_content_tags(["style"])
        .add_generic_attributes([
            "style",
            "class",
            "id",
            "align",
            "valign",
            "width",
            "height",
            "bgcolor",
            "color",
            "border",
            "cellpadding",
            "cellspacing",
            "dir",
            "face",
            "size",
            "background",
        ])
        .add_url_schemes(["cid", "data"])
        .url_relative(ammonia::UrlRelative::Deny)
        .link_rel(Some("noopener noreferrer"));
    builder
});

pub fn parse_summary(header: &[u8], partial_text: &[u8]) -> ParsedHeaders {
    let mut raw = Vec::with_capacity(header.len() + partial_text.len() + 2);
    raw.extend_from_slice(header);
    if !header.ends_with(b"\r\n\r\n") && !header.ends_with(b"\n\n") {
        raw.extend_from_slice(b"\r\n");
    }
    raw.extend_from_slice(partial_text);
    let Some(message) = MessageParser::default().parse(&raw) else {
        return ParsedHeaders::default();
    };
    let is_mixed = message.content_type().is_some_and(|content_type| {
        content_type.ctype().eq_ignore_ascii_case("multipart")
            && content_type
                .subtype()
                .is_some_and(|subtype| subtype.eq_ignore_ascii_case("mixed"))
    });
    ParsedHeaders {
        message_id: message.message_id().map(str::to_owned),
        in_reply_to: message
            .in_reply_to()
            .and_then(|ids| ids.first().map(str::to_owned)),
        references: message
            .references()
            .map(|ids| ids.iter().map(str::to_owned).collect())
            .unwrap_or_default(),
        subject: message.subject().map(str::to_owned),
        from: addresses(message.from()),
        to: addresses(message.to()),
        cc: addresses(message.cc()),
        reply_to: addresses(message.reply_to()),
        date: message.date().map(|date| date.to_timestamp() * 1000),
        has_attachment: is_mixed || (!partial_text.is_empty() && message.has_attachments()),
        preview: message
            .body_preview(PREVIEW_LENGTH * 2)
            .map(|preview| normalize_whitespace(&preview, PREVIEW_LENGTH)),
    }
}

fn addresses(list: Option<AddressList>) -> Vec<Address> {
    list.map(|list| {
        list.mailboxes()
            .filter_map(|mailbox| {
                Some(Address {
                    name: mailbox
                        .name()
                        .map(str::to_owned)
                        .filter(|name| !name.trim().is_empty()),
                    email: mailbox.address()?.to_owned(),
                })
            })
            .collect()
    })
    .unwrap_or_default()
}

fn normalize_whitespace(text: &str, max_characters: usize) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_characters)
        .collect()
}

pub fn render(raw: &[u8]) -> Result<RenderedBody> {
    let message = MessageParser::default()
        .parse(raw)
        .ok_or_else(|| Error::Server("unreadable message".into()))?;
    let has_html = message
        .html_body()
        .any(|part| part.is_content_type("text", "html"));
    let text = message.text_bodies().collect::<Vec<_>>().join("\n");
    let mut inline_content_ids = HashSet::new();
    let html = has_html.then(|| {
        let joined = message.html_bodies().collect::<Vec<_>>().join("\n");
        let sanitized = SANITIZER.clean(&joined).to_string();
        embed_inline_images(&message, sanitized, &mut inline_content_ids)
    });
    let has_remote_content = html.as_deref().is_some_and(references_remote_content);
    let attachments = message
        .attachments()
        .enumerate()
        .filter(|(_, part)| {
            !part
                .content_id()
                .is_some_and(|content_id| inline_content_ids.contains(content_id))
        })
        .map(|(index, part)| Attachment {
            index: index as u32,
            filename: part
                .attachment_name()
                .map(str::to_owned)
                .unwrap_or_else(|| format!("attachment-{}", index + 1)),
            mime_type: part
                .content_type()
                .map(|content_type| match content_type.subtype() {
                    Some(subtype) => format!("{}/{}", content_type.ctype(), subtype),
                    None => content_type.ctype().to_owned(),
                })
                .unwrap_or_else(|| "application/octet-stream".into())
                .to_ascii_lowercase(),
            size: part.decoded_len() as u64,
        })
        .collect();
    Ok(RenderedBody {
        html,
        text,
        has_remote_content,
        attachments,
    })
}

fn embed_inline_images(
    message: &Message,
    mut html: String,
    inline_content_ids: &mut HashSet<String>,
) -> String {
    for part in message.attachments() {
        let Some(content_id) = part.content_id() else {
            continue;
        };
        let reference = format!("cid:{content_id}");
        if !html.contains(&reference) || part.decoded_len() > INLINE_IMAGE_LIMIT {
            continue;
        }
        let Some(content_type) = part.content_type() else {
            continue;
        };
        if !content_type.ctype().eq_ignore_ascii_case("image") {
            continue;
        }
        let mime_type = format!("image/{}", content_type.subtype().unwrap_or("png"));
        let encoded = base64::engine::general_purpose::STANDARD.encode(part.decoded());
        html = html.replace(&reference, &format!("data:{mime_type};base64,{encoded}"));
        inline_content_ids.insert(content_id.to_owned());
    }
    html
}

fn references_remote_content(html: &str) -> bool {
    let lowercase = html.to_ascii_lowercase();
    [
        "src=\"http",
        "src='http",
        "url(http",
        "url(\"http",
        "url('http",
        "background=\"http",
        "srcset=\"http",
    ]
    .iter()
    .any(|pattern| lowercase.contains(pattern))
}

pub fn attachment(raw: &[u8], index: u32) -> Option<(String, Vec<u8>)> {
    let message = MessageParser::default().parse(raw)?;
    let part = message.attachments().nth(index as usize)?;
    let filename = part
        .attachment_name()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("attachment-{}", index + 1));
    Some((filename, part.decoded().into_owned()))
}

pub struct OutgoingMessage<'a> {
    pub message_id: &'a str,
    pub from: &'a Address,
    pub to: &'a [Address],
    pub cc: &'a [Address],
    pub bcc: &'a [Address],
    pub subject: &'a str,
    pub body_text: &'a str,
    pub in_reply_to: Option<&'a str>,
    pub references: &'a [String],
}

pub struct BuiltMessage {
    pub raw: Vec<u8>,
    pub envelope_from: String,
    pub recipients: Vec<String>,
}

pub fn build_message(outgoing: &OutgoingMessage) -> Result<BuiltMessage> {
    let mut builder = MessageBuilder::new()
        .from(mailbox(outgoing.from)?)
        .subject(outgoing.subject)
        .message_id(Some(format!("<{}>", outgoing.message_id)));
    for address in outgoing.to {
        builder = builder.to(mailbox(address)?);
    }
    for address in outgoing.cc {
        builder = builder.cc(mailbox(address)?);
    }
    for address in outgoing.bcc {
        builder = builder.bcc(mailbox(address)?);
    }
    if let Some(in_reply_to) = outgoing.in_reply_to {
        builder = builder.in_reply_to(format!("<{in_reply_to}>"));
    }
    if !outgoing.references.is_empty() {
        let references = outgoing
            .references
            .iter()
            .map(|id| format!("<{id}>"))
            .collect::<Vec<_>>()
            .join(" ");
        builder = builder.references(references);
    }
    let message = builder
        .header(ContentType::TEXT_PLAIN)
        .body(outgoing.body_text.to_owned())
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let envelope = message.envelope();
    Ok(BuiltMessage {
        raw: message.formatted(),
        envelope_from: envelope.from().map(ToString::to_string).unwrap_or_default(),
        recipients: envelope.to().iter().map(ToString::to_string).collect(),
    })
}

fn mailbox(address: &Address) -> Result<LettreMailbox> {
    let email = address
        .email
        .parse()
        .map_err(|_| Error::InvalidInput(format!("invalid address: {}", address.email)))?;
    Ok(LettreMailbox::new(address.name.clone(), email))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER: &[u8] = b"From: =?UTF-8?Q?Ren=C3=A9e?= <renee@example.com>\r\n\
To: bob@example.com\r\n\
Subject: Hello\r\n\
Message-ID: <reply@example.com>\r\n\
References: <root@example.com> <middle@example.com>\r\n\
In-Reply-To: <middle@example.com>\r\n\
Date: Tue, 3 Nov 2026 10:00:00 +0000\r\n\
Content-Type: multipart/alternative; boundary=\"b\"\r\n\r\n";

    #[test]
    fn summary_extracts_threading_headers_and_preview_from_a_truncated_body() {
        let text = b"--b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBonjour   Bob,\r\nvoici le\r\n--b\r\nContent-Type: text/html\r\n\r\n<p>trunc";
        let headers = parse_summary(HEADER, text);
        assert_eq!(headers.from[0].name.as_deref(), Some("Renée"));
        assert_eq!(headers.thread_root(), Some("root@example.com"));
        assert_eq!(headers.in_reply_to.as_deref(), Some("middle@example.com"));
        assert_eq!(headers.preview.as_deref(), Some("Bonjour Bob, voici le"));
        assert!(!headers.has_attachment);
    }

    #[test]
    fn render_sanitizes_html_and_flags_remote_images() {
        let raw = b"From: a@example.com\r\nContent-Type: text/html\r\n\r\n<p onclick=\"x()\" style=\"color:red\">Hi<script>alert(1)</script><img src=\"https://t.example/p.gif\"></p>";
        let body = render(raw).unwrap();
        let html = body.html.unwrap();
        assert!(!html.contains("script"));
        assert!(!html.contains("onclick"));
        assert!(html.contains("color:red"));
        assert!(body.has_remote_content);
    }

    #[test]
    fn built_reply_keeps_bcc_out_of_the_headers() {
        let from = Address {
            name: Some("Alice".into()),
            email: "alice@example.com".into(),
        };
        let bob = Address {
            name: None,
            email: "bob@example.com".into(),
        };
        let carol = Address {
            name: None,
            email: "carol@example.com".into(),
        };
        let built = build_message(&OutgoingMessage {
            message_id: "new@example.com",
            from: &from,
            to: &[bob],
            cc: &[],
            bcc: &[carol],
            subject: "Re: Hello",
            body_text: "Merci !",
            in_reply_to: Some("reply@example.com"),
            references: &["root@example.com".into(), "reply@example.com".into()],
        })
        .unwrap();
        let raw = String::from_utf8(built.raw).unwrap();
        assert!(raw.contains("In-Reply-To: <reply@example.com>"));
        assert!(!raw.contains("carol@example.com"));
        assert_eq!(
            built.recipients,
            vec!["bob@example.com", "carol@example.com"]
        );
    }
}
