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
fn summary_keeps_the_sender_behind_an_alias_service() {
    let header = b"From: \"Claire - claire at atlas.example\" <reply+abc@simplelogin.co>\r\n\
X-SimpleLogin-Original-From: =?utf-8?q?Claire_Dubois?= <Claire@Atlas.example>\r\n\r\n";
    let headers = parse_summary(header, b"");
    assert_eq!(headers.from[0].email, "reply+abc@simplelogin.co");
    assert_eq!(
        headers.original_sender.as_deref(),
        Some("Claire@Atlas.example")
    );
    assert_eq!(parse_summary(HEADER, b"").original_sender, None);

    let header = b"From: <shop+hello=store.example@johndoe.addy.io>\r\n\
X-AnonAddy-Original-Sender: hello@store.example\r\n\r\n";
    assert_eq!(
        parse_summary(header, b"").original_sender.as_deref(),
        Some("hello@store.example")
    );
}

#[test]
fn summary_decodes_multi_byte_charsets() {
    let header = b"From: =?ISO-2022-JP?B?GyRCOzNFRBsoQiAbJEJCQE86GyhC?= <yamada@example.jp>\r\n\
Subject: =?ISO-2022-JP?B?GyRCMnE1RCROJCpDTiRpJDsbKEI=?=\r\n\
Content-Type: text/plain; charset=ISO-2022-JP\r\n\r\n";
    let headers = parse_summary(header, b"\x1b$BL@F|$O\x1b(B10\x1b$B;~$G$9!#\x1b(B");
    assert_eq!(headers.from[0].name.as_deref(), Some("山田 太郎"));
    assert_eq!(headers.subject.as_deref(), Some("会議のお知らせ"));
    assert_eq!(headers.preview.as_deref(), Some("明日は10時です。"));

    let header = b"Content-Type: text/plain; charset=Shift_JIS\r\n\r\n";
    let headers = parse_summary(
        header,
        b"\x90\xbf\x8b\x81\x8f\x91\x82\xcc\x82\xb2\x88\xc4\x93\xe0",
    );
    assert_eq!(headers.preview.as_deref(), Some("請求書のご案内"));

    let header = b"Content-Type: text/plain; charset=ks_c_5601-1987\r\nContent-Transfer-Encoding: base64\r\n\r\n";
    let headers = parse_summary(header, b"yLjAxyDAz8GkIL7Is7s=");
    assert_eq!(headers.preview.as_deref(), Some("회의 일정 안내"));

    let header = b"Content-Type: text/plain; charset=gbk\r\n\r\n";
    let headers = parse_summary(header, b"\xc4\xe3\xba\xc3\xc4");
    assert_eq!(headers.preview.as_deref(), Some("你好"));
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
fn render_drops_the_document_title() {
    let raw = b"From: a@example.com\r\nContent-Type: text/html\r\n\r\n<html><head><title>Weekly deals</title></head><body><p>Hello</p></body></html>";
    let html = render(raw).unwrap().html.unwrap();
    assert!(!html.contains("Weekly deals"));
    assert!(html.contains("Hello"));
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
    let built = build_message(OutgoingMessage {
        message_id: "new@example.com",
        from: &from,
        to: &[bob],
        cc: &[],
        bcc: &[carol],
        subject: "Re: Hello",
        body_text: "Merci !",
        body_html: None,
        in_reply_to: Some("reply@example.com"),
        references: &["root@example.com".into(), "reply@example.com".into()],
        attachments: vec![],
        calendar: None,
        draft: false,
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

#[test]
fn bcc_recipients_become_a_header_only_when_asked() {
    let from = Address {
        name: None,
        email: "alice@example.com".into(),
    };
    let bob = Address {
        name: None,
        email: "Bob@example.com".into(),
    };
    let carol = Address {
        name: None,
        email: "carol@example.com".into(),
    };
    let built = build_message(OutgoingMessage {
        message_id: "new@example.com",
        from: &from,
        to: &[bob],
        cc: &[],
        bcc: &[carol],
        subject: "Hello",
        body_text: "Hi",
        body_html: None,
        in_reply_to: None,
        references: &[],
        attachments: vec![],
        calendar: None,
        draft: false,
    })
    .unwrap();
    let raw = String::from_utf8(with_bcc_header(&built.raw, &built.recipients)).unwrap();
    assert!(raw.starts_with("Bcc: carol@example.com\r\n"));
    assert!(!raw.contains("Bcc: carol@example.com, bob"));
    assert_eq!(
        with_bcc_header(&built.raw, &["bob@example.com".into()]),
        built.raw
    );
}

fn with_attachments(attachments: Vec<AttachmentContent>) -> Vec<u8> {
    let from = Address {
        name: Some("Alice".into()),
        email: "alice@example.com".into(),
    };
    let bob = Address {
        name: None,
        email: "bob@example.com".into(),
    };
    build_message(OutgoingMessage {
        message_id: "files@example.com",
        from: &from,
        to: &[bob],
        cc: &[],
        bcc: &[],
        subject: "Documents",
        body_text: "Voici les documents.",
        body_html: None,
        in_reply_to: None,
        references: &[],
        attachments,
        calendar: None,
        draft: false,
    })
    .unwrap()
    .raw
}

#[test]
fn a_reply_with_html_keeps_the_quoted_formatting() {
    let alice = Address {
        name: None,
        email: "alice@example.com".into(),
    };
    let built = build_message(OutgoingMessage {
        message_id: "html@example.com",
        from: &alice,
        to: std::slice::from_ref(&alice),
        cc: &[],
        bcc: &[],
        subject: "Re: Menu",
        body_text: "Oui\n\n> <b>Pizza</b>",
        body_html: Some("<p>Oui</p><blockquote type=\"cite\"><b>Pizza</b></blockquote>"),
        in_reply_to: None,
        references: &[],
        attachments: vec![],
        calendar: None,
        draft: false,
    })
    .unwrap();
    let rendered = render(&built.raw).unwrap();
    assert!(rendered.html.unwrap().contains("<b>Pizza</b>"));
    assert!(rendered.text.contains("Oui"));
}

#[test]
fn builds_multipart_mixed_with_attachments() {
    let raw = with_attachments(vec![
        AttachmentContent {
            filename: "devis.pdf".into(),
            mime_type: "application/pdf".into(),
            bytes: vec![7; 4_000],
        },
        AttachmentContent {
            filename: "photo.jpg".into(),
            mime_type: "image/jpeg".into(),
            bytes: vec![1, 2, 3],
        },
    ]);
    let rendered = render(&raw).unwrap();
    assert!(rendered.text.contains("Voici les documents."));
    let listed: Vec<(String, String, u64)> = rendered
        .attachments
        .iter()
        .map(|attachment| {
            (
                attachment.filename.clone(),
                attachment.mime_type.clone(),
                attachment.size,
            )
        })
        .collect();
    assert_eq!(
        listed,
        vec![
            ("devis.pdf".into(), "application/pdf".into(), 4_000),
            ("photo.jpg".into(), "image/jpeg".into(), 3),
        ]
    );
}

#[test]
fn keeps_non_ascii_and_slashed_filenames() {
    let raw = with_attachments(vec![AttachmentContent {
        filename: "Facture n°12/2026.pdf".into(),
        mime_type: "application/pdf".into(),
        bytes: vec![0; 10],
    }]);
    assert_eq!(
        render(&raw).unwrap().attachments[0].filename,
        "Facture n°12/2026.pdf"
    );
}

#[test]
fn an_unknown_mime_type_is_sent_as_octet_stream() {
    let raw = with_attachments(vec![AttachmentContent {
        filename: "notes".into(),
        mime_type: "not a type".into(),
        bytes: vec![0; 10],
    }]);
    assert_eq!(
        render(&raw).unwrap().attachments[0].mime_type,
        "application/octet-stream"
    );
}

fn unsubscribe_of(headers: &str) -> Option<Unsubscribe> {
    let raw = format!(
        "From: news@x.example\r\nTo: bob@example.com\r\nSubject: News\r\n{headers}Content-Type: text/plain\r\n\r\nHello\r\n"
    );
    render(raw.as_bytes()).unwrap().unsubscribe
}

#[test]
fn reads_how_a_message_was_sent_from_its_headers() {
    let signals = |headers: &[u8]| parse_summary(headers, b"").signals;
    let newsletter = signals(
            b"From: News <news@brand.example>\r\nSubject: Hi\r\nList-Unsubscribe: <https://brand.example/u>\r\nX-Mailer: Mailchimp Mailer\r\n\r\n",
        );
    assert!(newsletter.bulk && newsletter.marketing && !newsletter.automated);
    let robot = signals(
        b"From: robot@ci.example\r\nSubject: Build\r\nAuto-Submitted: auto-generated\r\n\r\n",
    );
    assert!(robot.automated && !robot.bulk);
    assert!(
        signals(b"From: list@lists.example\r\nSubject: Digest\r\nPrecedence: bulk\r\n\r\n").bulk
    );
    assert!(
        signals(
            b"From: list@lists.example\r\nSubject: Digest\r\nList-Id: <dev.lists.example>\r\n\r\n"
        )
        .bulk
    );
    assert!(signals(b"From: shop@brand.example\r\nSubject: Hi\r\nX-CSA-Complaints: csa-complaints@eco.de\r\n\r\n").marketing);
    assert!(
        signals(b"From: shop@brand.example\r\nSubject: Hi\r\nX-Mailin-Campaign: 42\r\n\r\n")
            .marketing
    );
    let one_click = signals(
            b"From: news@brand.example\r\nSubject: Hi\r\nList-Unsubscribe: <https://brand.example/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\n",
        );
    assert!(one_click.bulk && one_click.one_click && !one_click.marketing);
    assert!(
            signals(b"From: gitlab@code.example\r\nSubject: Pipeline\r\nX-Auto-Response-Suppress: All\r\n\r\n")
                .automated
        );
    assert_eq!(
        signals(b"From: bob@example.com\r\nSubject: Lunch\r\nAuto-Submitted: no\r\n\r\n"),
        SendingSignals::default()
    );
}

#[test]
fn parses_list_unsubscribe_variants() {
    assert_eq!(
        unsubscribe_of(
            "List-Unsubscribe: <https://x.example/u?id=1>, <mailto:leave@x.example?subject=stop>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n"
        ),
        Some(Unsubscribe {
            https_url: Some("https://x.example/u?id=1".into()),
            mailto: Some("mailto:leave@x.example?subject=stop".into()),
            one_click: true,
        })
    );
    assert_eq!(
        unsubscribe_of("List-Unsubscribe: <mailto:leave@x.example>\r\n"),
        Some(Unsubscribe {
            https_url: None,
            mailto: Some("mailto:leave@x.example".into()),
            one_click: false,
        })
    );
    assert_eq!(
        unsubscribe_of("List-Unsubscribe: <http://x.example/u>\r\n"),
        None
    );
    assert_eq!(unsubscribe_of(""), None);
}

#[test]
fn a_server_preview_is_trimmed_like_a_computed_one() {
    assert_eq!(
        server_preview("  Lunch\r\n   at noon?  ").as_deref(),
        Some("Lunch at noon?")
    );
    assert_eq!(server_preview(" \r\n "), None);
    assert_eq!(
        server_preview(&"word ".repeat(100)).map(|preview| preview.chars().count()),
        Some(PREVIEW_LENGTH)
    );
}

const INVITATION: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:kickoff@atlas\r\nSUMMARY:Atlas kickoff\r\nDTSTART:20261203T090000Z\r\nDTEND:20261203T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

#[test]
fn render_keeps_the_invitation_of_an_outlook_mail() {
    let raw = format!(
        "From: c@atlas.example\r\nTo: b@example.com\r\nSubject: Kickoff\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"a\"\r\n\r\n--a\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nWhen: Thursday\r\n--a\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<p>When: Thursday</p>\r\n--a\r\nContent-Type: text/calendar; charset=UTF-8; method=REQUEST\r\n\r\n{INVITATION}\r\n--a--\r\n"
    );
    let body = render(raw.as_bytes()).unwrap();
    assert!(
        body.calendar
            .as_deref()
            .unwrap()
            .starts_with("BEGIN:VCALENDAR")
    );
    assert!(
        body.calendar
            .as_deref()
            .unwrap()
            .contains("SUMMARY:Atlas kickoff")
    );
    assert_eq!(
        body.attachments
            .iter()
            .map(|attachment| attachment.mime_type.as_str())
            .collect::<Vec<_>>(),
        ["text/calendar"]
    );
}

#[test]
fn render_reads_an_ics_attachment() {
    let raw = format!(
        "From: c@atlas.example\r\nTo: b@example.com\r\nSubject: Kickoff\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"m\"\r\n\r\n--m\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nSee attached\r\n--m\r\nContent-Type: application/ics; name=\"invite.ics\"\r\nContent-Disposition: attachment; filename=\"invite.ics\"\r\n\r\n{INVITATION}\r\n--m--\r\n"
    );
    assert!(
        render(raw.as_bytes())
            .unwrap()
            .calendar
            .unwrap()
            .contains("UID:kickoff@atlas")
    );
}

#[test]
fn render_without_invitation_has_no_calendar() {
    let raw = b"From: a@example.com\r\nSubject: Hi\r\nContent-Type: text/plain\r\n\r\nHello\r\n";
    assert_eq!(render(raw).unwrap().calendar, None);
}

const REPLY: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REPLY\r\nBEGIN:VEVENT\r\nUID:kickoff@atlas\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:bob@example.com\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

fn calendar_reply(attachments: Vec<AttachmentContent>) -> String {
    let bob = Address {
        name: Some("Bob".into()),
        email: "bob@example.com".into(),
    };
    let claire = Address {
        name: None,
        email: "claire@atlas.example".into(),
    };
    let built = build_message(OutgoingMessage {
        message_id: "answer@example.com",
        from: &bob,
        to: &[claire],
        cc: &[],
        bcc: &[],
        subject: "Accepted: Atlas kickoff",
        body_text: "Bob accepted the invitation.",
        body_html: None,
        in_reply_to: Some("invite@atlas.example"),
        references: &[],
        attachments,
        calendar: Some(REPLY),
        draft: false,
    })
    .unwrap();
    String::from_utf8(built.raw).unwrap()
}

#[test]
fn builds_a_calendar_reply_as_an_alternative() {
    let raw = calendar_reply(vec![]);
    assert!(raw.contains("Content-Type: multipart/alternative"), "{raw}");
    assert!(!raw.contains("multipart/mixed"));
    assert!(
        raw.contains("Content-Type: text/calendar; charset=utf-8; method=REPLY"),
        "{raw}"
    );
    let body = render(raw.as_bytes()).unwrap();
    assert_eq!(body.text.trim(), "Bob accepted the invitation.");
    assert_eq!(body.calendar.as_deref(), Some(REPLY));
}

#[test]
fn keeps_the_calendar_reply_next_to_attachments() {
    let raw = calendar_reply(vec![AttachmentContent {
        filename: "agenda.pdf".into(),
        mime_type: "application/pdf".into(),
        bytes: b"%PDF-1.7".to_vec(),
    }]);
    assert!(raw.contains("Content-Type: multipart/mixed"));
    let body = render(raw.as_bytes()).unwrap();
    assert!(body.calendar.unwrap().contains("PARTSTAT=ACCEPTED"));
    assert!(
        body.attachments
            .iter()
            .any(|attachment| attachment.filename == "agenda.pdf")
    );
}

const QUOTE: &str = "From: Claire <claire@atlas.example>\r\nTo: bob@example.com\r\nCc: Nadia <nadia@atlas.example>\r\nSubject: Original quote\r\nDate: Tue, 24 Nov 2026 10:00:00 +0100\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"i\"\r\n\r\n--i\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Here is the <b>quote</b>.</p>\r\n--i\r\nContent-Type: application/pdf; name=\"quote.pdf\"\r\nContent-Disposition: attachment; filename=\"quote.pdf\"\r\n\r\n%PDF-1.7\r\n--i--\r\n";

fn forwarding(part_headers: &str, inner: &str) -> String {
    format!(
        "From: Bob <bob@example.com>\r\nTo: alice@example.com\r\nSubject: Fwd: quote\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"o\"\r\n\r\n--o\r\nContent-Type: text/plain\r\n\r\nSee attached.\r\n--o\r\n{part_headers}\r\n\r\n{inner}\r\n--o--\r\n"
    )
}

#[test]
fn names_an_attached_message_after_its_subject() {
    let raw = forwarding(
        "Content-Type: message/rfc822\r\nContent-Disposition: attachment",
        QUOTE,
    );
    let body = render(raw.as_bytes()).unwrap();
    assert_eq!(body.attachments[0].filename, "Original quote.eml");
    assert_eq!(body.attachments[0].mime_type, "message/rfc822");
    assert_eq!(
        crate::attachment(raw.as_bytes(), 0).unwrap().0,
        "Original quote.eml"
    );
}

#[test]
fn names_a_message_without_subject_message_eml() {
    let raw = forwarding(
        "Content-Type: message/rfc822",
        "From: a@example.com\r\nTo: b@example.com\r\n\r\nHi\r\n",
    );
    assert_eq!(
        render(raw.as_bytes()).unwrap().attachments[0].filename,
        "message.eml"
    );
}

#[test]
fn reports_an_eml_file_as_a_message() {
    let raw = forwarding(
        "Content-Type: application/octet-stream; name=\"old.EML\"\r\nContent-Disposition: attachment; filename=\"old.EML\"",
        QUOTE,
    );
    let body = render(raw.as_bytes()).unwrap();
    assert_eq!(
        (
            body.attachments[0].filename.as_str(),
            body.attachments[0].mime_type.as_str()
        ),
        ("old.EML", "message/rfc822")
    );
}

#[test]
fn reads_a_saved_message() {
    let message = crate::read_message(QUOTE.as_bytes()).unwrap();
    assert_eq!(message.subject, "Original quote");
    assert_eq!(message.from[0].email, "claire@atlas.example");
    assert_eq!(message.to[0].email, "bob@example.com");
    assert_eq!(message.cc[0].name.as_deref(), Some("Nadia"));
    assert_eq!(message.date, Some(1_795_510_800_000));
    assert!(message.body.html.unwrap().contains("<b>quote</b>"));
    assert_eq!(message.body.attachments[0].filename, "quote.pdf");
}

#[test]
fn previews_a_message_whose_attachment_is_cut_by_the_partial_fetch() {
    let header = b"Content-Type: multipart/mixed; boundary=\"==b==\"\r\nMIME-Version: 1.0\r\n\
From: Claire Dubois <claire@atlas.example>\r\nSubject: Scan from the copier\r\n\r\n";
    let mut text = b"--==b==\r\nContent-Type: text/plain; charset=\"us-ascii\"\r\n\
MIME-Version: 1.0\r\nContent-Transfer-Encoding: 7bit\r\n\r\nScanned page attached.\r\n\
--==b==\r\nContent-Type: image/tiff\r\nMIME-Version: 1.0\r\nContent-Transfer-Encoding: base64\r\n\
Content-Disposition: attachment; filename=\"Scan copier.tif\"\r\n\r\n"
        .to_vec();
    while text.len() < 2048 {
        text.extend_from_slice(
            b"SUkqAAgAAAAJAAABAwABAAAAoAAAAAEBAwABAAAAZAAAAAIBAwABAAAACAAAAAMBAwAB\r\n",
        );
    }
    text.truncate(2048);
    assert_eq!(
        parse_summary(header, &text).preview.as_deref(),
        Some("Scanned page attached.")
    );
}
