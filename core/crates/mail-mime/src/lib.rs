use std::collections::HashSet;
use std::sync::LazyLock;

use base64::Engine;
use lettre::message::header::ContentType;
use lettre::message::{
    Attachment as LettreAttachment, Mailbox as LettreMailbox, MessageBuilder, MultiPart, SinglePart,
};
use mail_model::{
    Address, Attachment, Error, ParsedHeaders, RenderedBody, Result, SendingSignals, Unsubscribe,
};
use mail_parser::{AddressList, HeaderForm, Message};

mod charsets;
mod code_pages;

const PREVIEW_LENGTH: usize = 180;
const INLINE_IMAGE_LIMIT: usize = 2 * 1024 * 1024;

static SANITIZER: LazyLock<ammonia::Builder<'static>> = LazyLock::new(|| {
    let mut builder = ammonia::Builder::default();
    builder
        .add_tags(["style", "center", "font", "span", "div"])
        .rm_clean_content_tags(["style"])
        .add_clean_content_tags(["title"])
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
    let Some(message) = charsets::parse(&raw) else {
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
        preview: message.body_preview(PREVIEW_LENGTH * 2).map(|preview| {
            normalize_whitespace(preview.trim_end_matches('\u{fffd}'), PREVIEW_LENGTH)
        }),
        signals: sending_signals(&message),
        original_sender: original_sender(&message),
    }
}

const ORIGINAL_SENDER_HEADERS: &[&str] =
    &["X-SimpleLogin-Original-From", "X-AnonAddy-Original-Sender"];

fn original_sender(message: &Message) -> Option<String> {
    ORIGINAL_SENDER_HEADERS.iter().find_map(|name| {
        let parsed = message
            .headers()
            .get(*name)?
            .parse_as(HeaderForm::Addresses);
        addresses(parsed.value().as_address())
            .into_iter()
            .next()
            .map(|address| address.email)
    })
}

const MARKETING_MAILERS: &[&str] = &[
    "mailchimp",
    "sendinblue",
    "brevo",
    "klaviyo",
    "hubspot",
    "exacttarget",
    "salesforce",
    "campaign monitor",
    "emarsys",
    "selligent",
    "sarbacane",
    "mailerlite",
    "constant contact",
    "acoustic",
    "mailjet campaign",
];

const CAMPAIGN_HEADERS: &[&str] = &[
    "X-CSA-Complaints",
    "X-Campaign",
    "X-CampaignID",
    "X-Mailin-Campaign",
    "X-Mailjet-Campaign",
];

fn sending_signals(message: &Message) -> SendingSignals {
    let headers = message.headers();
    let text = |name: &str| {
        headers
            .value(name)
            .and_then(|value| value.as_text().map(str::to_ascii_lowercase))
    };
    let precedence = text("Precedence").unwrap_or_default();
    let auto_submitted = text("Auto-Submitted").unwrap_or_default();
    let mailer = text("X-Mailer").unwrap_or_default();
    SendingSignals {
        bulk: message.list_unsubscribe().is_some()
            || headers.contains("List-Id")
            || ["bulk", "list", "junk"].contains(&precedence.trim()),
        automated: (!auto_submitted.is_empty() && auto_submitted.trim() != "no")
            || precedence.trim() == "auto_reply"
            || headers.contains("X-Auto-Response-Suppress"),
        marketing: CAMPAIGN_HEADERS.iter().any(|name| headers.contains(*name))
            || MARKETING_MAILERS
                .iter()
                .any(|platform| mailer.contains(platform)),
        one_click: text("List-Unsubscribe-Post").is_some_and(|value| value.contains("one-click")),
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

pub fn server_preview(text: &str) -> Option<String> {
    Some(normalize_whitespace(text, PREVIEW_LENGTH)).filter(|preview| !preview.is_empty())
}

fn normalize_whitespace(text: &str, max_characters: usize) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_characters)
        .collect()
}

pub fn with_bcc_header(raw: &[u8], recipients: &[String]) -> Vec<u8> {
    let visible: HashSet<String> = charsets::parse(raw)
        .map(|message| {
            addresses(message.to())
                .into_iter()
                .chain(addresses(message.cc()))
                .map(|address| address.email.to_lowercase())
                .collect()
        })
        .unwrap_or_default();
    let hidden: Vec<&str> = recipients
        .iter()
        .filter(|recipient| !visible.contains(&recipient.to_lowercase()))
        .map(String::as_str)
        .collect();
    if hidden.is_empty() {
        return raw.to_vec();
    }
    let mut with_header = format!("Bcc: {}\r\n", hidden.join(", ")).into_bytes();
    with_header.extend_from_slice(raw);
    with_header
}

pub fn render(raw: &[u8]) -> Result<RenderedBody> {
    let message = charsets::parse(raw).ok_or_else(|| Error::Server("unreadable message".into()))?;
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
        unsubscribe: unsubscribe(&message),
    })
}

fn unsubscribe(message: &Message) -> Option<Unsubscribe> {
    let list = message.list_unsubscribe()?;
    let targets: Vec<&str> = list
        .mailboxes()
        .filter_map(|mailbox| mailbox.address())
        .collect();
    let https_url = targets
        .iter()
        .find(|target| target.to_ascii_lowercase().starts_with("https://"))
        .map(|target| (*target).to_owned());
    let mailto = targets
        .iter()
        .find(|target| target.to_ascii_lowercase().starts_with("mailto:"))
        .map(|target| (*target).to_owned());
    if https_url.is_none() && mailto.is_none() {
        return None;
    }
    let one_click = https_url.is_some()
        && message
            .headers()
            .get("List-Unsubscribe-Post")
            .is_some_and(|post| {
                String::from_utf8_lossy(post.raw_value()).contains("List-Unsubscribe=One-Click")
            });
    Some(Unsubscribe {
        https_url,
        mailto,
        one_click,
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
    let message = charsets::parse(raw)?;
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
    pub body_html: Option<&'a str>,
    pub in_reply_to: Option<&'a str>,
    pub references: &'a [String],
    pub attachments: Vec<AttachmentContent>,
}

pub struct AttachmentContent {
    pub filename: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

pub struct BuiltMessage {
    pub raw: Vec<u8>,
    pub envelope_from: String,
    pub recipients: Vec<String>,
}

pub fn build_message(outgoing: OutgoingMessage) -> Result<BuiltMessage> {
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
    let text = outgoing.body_text.to_owned();
    let message = if outgoing.attachments.is_empty() {
        match outgoing.body_html {
            Some(html) => {
                builder.multipart(MultiPart::alternative_plain_html(text, html.to_owned()))
            }
            None => builder.header(ContentType::TEXT_PLAIN).body(text),
        }
    } else {
        let body = match outgoing.body_html {
            Some(html) => MultiPart::mixed()
                .multipart(MultiPart::alternative_plain_html(text, html.to_owned())),
            None => MultiPart::mixed().singlepart(SinglePart::plain(text)),
        };
        let parts = outgoing
            .attachments
            .into_iter()
            .fold(body, |parts, attachment| {
                let content_type = ContentType::parse(&attachment.mime_type)
                    .unwrap_or_else(|_| ContentType::parse("application/octet-stream").unwrap());
                parts.singlepart(
                    LettreAttachment::new(attachment.filename).body(attachment.bytes, content_type),
                )
            });
        builder.multipart(parts)
    }
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
#[path = "../../../tests/mail_mime/lib.rs"]
mod tests;
