use crate::{parse_summary, render};

#[test]
fn aliases_and_split_iso_2022_jp_words_decode() {
    let header = b"From: =?iso-2022-jp-2?B?GyRCOzNFRBsoQg==?= <y@example.jp>\r\n\
Subject: =?ISO-2022-JP?B?GyRCRnxLXBsoQg==?=\r\n =?ISO-2022-JP?B?GyRCOGwbKEI=?=\r\n\
Content-Type: text/plain; charset=cp932\r\nContent-Transfer-Encoding: 8bit\r\n\r\n";
    let headers = parse_summary(
        header,
        b"\x90\xbf\x8b\x81\x8f\x91\x82\xcc\x82\xb2\x88\xc4\x93\xe0",
    );
    assert_eq!(headers.from[0].name.as_deref(), Some("山田"));
    assert_eq!(headers.subject.as_deref(), Some("日本語"));
    assert_eq!(headers.preview.as_deref(), Some("請求書のご案内"));
}

#[test]
fn raw_header_text_follows_the_declared_charset() {
    let koi8 =
        b"Subject: \xf0\xd2\xc9\xd7\xc5\xd4\r\nContent-Type: text/plain; charset=koi8-r\r\n\r\n";
    assert_eq!(parse_summary(koi8, b"").subject.as_deref(), Some("Привет"));
    assert_eq!(
        parse_summary(b"Subject: Caf\xe9\r\n\r\n", b"")
            .subject
            .as_deref(),
        Some("Café")
    );
    let jis = b"Subject: \x1b$BF|K\\8l\x1b(B\r\n\r\n";
    assert_eq!(parse_summary(jis, b"").subject.as_deref(), Some("日本語"));

    let raw = b"Content-Type: multipart/mixed; boundary=\"b\"\r\n\r\n--b\r\n\
Content-Type: text/plain; charset=ISO-2022-JP\r\n\r\nhi\r\n--b\r\n\
Content-Type: application/pdf\r\nContent-Disposition: attachment; filename=\"\x8e\x91\x97\xbf.pdf\"\r\n\
Content-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n--b--\r\n";
    assert_eq!(render(raw).unwrap().attachments[0].filename, "資料.pdf");
}

#[test]
fn charsets_mail_parser_leaves_out_decode() {
    let kr = b"Subject: =?ISO-2022-KR?B?GyQpQw5IOEBHDyAOQE9BJA8gDj5IMzsP?=\r\n\
Content-Type: text/plain; charset=ISO-2022-KR\r\n\r\n";
    let headers = parse_summary(kr, b"\x1b$)C\x0eH8@G\x0f \x0e@OA$\x0f \x0e>H3;\x0f\r\n");
    assert_eq!(headers.subject.as_deref(), Some("회의 일정 안내"));
    assert_eq!(headers.preview.as_deref(), Some("회의 일정 안내"));

    let hz = b"Subject: =?HZ-GB-2312?B?fntEYzpDIyxKQD1nfn0=?=\r\n\
Content-Type: text/plain; charset=HZ-GB-2312\r\n\r\n";
    let headers = parse_summary(hz, b"~{Dc:C#,J@=g~}\r\n");
    assert_eq!(headers.subject.as_deref(), Some("你好，世界"));
    assert_eq!(headers.preview.as_deref(), Some("你好，世界"));

    let dos = b"Subject: =?cp437?B?UoJzdW2C?=\r\n\
Content-Type: text/plain; charset=cp437\r\nContent-Transfer-Encoding: 8bit\r\n\r\n";
    let headers = parse_summary(dos, b"Caf\x82 cr\x8ame\r\n");
    assert_eq!(headers.subject.as_deref(), Some("Résumé"));
    assert_eq!(headers.preview.as_deref(), Some("Café crème"));

    let raw = b"Content-Type: multipart/mixed; boundary=\"b\"\r\n\r\n--b\r\n\
Content-Type: text/plain; charset=IBM852\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\
Za\xbe\xa2\x88\x86 g\xa9\x98l\xa5 ja\xab\xe4\r\n--b\r\n\
Content-Type: application/pdf; name=\"a.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n--b--\r\n";
    let body = render(raw).unwrap();
    assert_eq!(body.text, "Zażółć gęślą jaźń");
    assert_eq!(body.attachments[0].filename, "a.pdf");
}

#[test]
fn text_without_a_charset_is_read_from_its_meta_or_as_windows_1252() {
    let html = b"Content-Type: text/html\r\n\r\n";
    let body = b"<html><head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=Shift_JIS\"></head><body>\x82\xa8\x92m\x82\xe7\x82\xb9</body></html>";
    assert_eq!(
        parse_summary(html, body).preview.as_deref(),
        Some("お知らせ")
    );
    let plain = b"Content-Type: text/plain\r\n\r\n";
    assert_eq!(
        parse_summary(plain, b"caf\xe9\r\n").preview.as_deref(),
        Some("café")
    );
    assert_eq!(
        parse_summary(plain, b"caf\xc3\xa9 cr\xc3")
            .preview
            .as_deref(),
        Some("café cr")
    );
}
