use super::*;

#[test]
fn xoauth2_payload() {
    assert_eq!(
        xoauth2("alice@outlook.com", "tok"),
        "user=alice@outlook.com\x01auth=Bearer tok\x01\x01"
    );
}

async fn xoauth2_server(accept: bool) -> tokio::io::DuplexStream {
    use base64::Engine;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (client, server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(server);
        let mut lines = BufReader::new(read).lines();
        let command = lines.next_line().await.unwrap().unwrap();
        let (tag, rest) = command.split_once(' ').unwrap();
        assert_eq!(rest, "AUTHENTICATE XOAUTH2");
        write.write_all(b"+ \r\n").await.unwrap();
        let response = lines.next_line().await.unwrap().unwrap();
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(response.trim())
            .unwrap();
        assert_eq!(decoded, xoauth2("alice@outlook.com", "tok").as_bytes());
        if accept {
            write
                .write_all(format!("{tag} OK AUTHENTICATE completed\r\n").as_bytes())
                .await
                .unwrap();
        } else {
            let error = base64::engine::general_purpose::STANDARD
                    .encode(r#"{"status":"401","schemes":"bearer","scope":"https://outlook.office.com/IMAP.AccessAsUser.All"}"#);
            write
                .write_all(format!("+ {error}\r\n").as_bytes())
                .await
                .unwrap();
            assert_eq!(lines.next_line().await.unwrap().unwrap().trim(), "");
            write
                .write_all(format!("{tag} NO AUTHENTICATE failed.\r\n").as_bytes())
                .await
                .unwrap();
        }
        let _ = lines.next_line().await;
    });
    client
}

fn stalwart() -> ServerEndpoint {
    ServerEndpoint {
        host: "mail.example.org".into(),
        port: 993,
        security: Security::Tls,
    }
}

#[test]
fn oauthbearer_payload() {
    assert_eq!(
        oauthbearer("alice@example.org", &stalwart(), "tok"),
        "n,a=alice@example.org,\x01host=mail.example.org\x01port=993\x01auth=Bearer tok\x01\x01"
    );
}

async fn oauthbearer_server(error: Option<&'static str>) -> tokio::io::DuplexStream {
    use base64::Engine;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (client, server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(server);
        let mut lines = BufReader::new(read).lines();
        let command = lines.next_line().await.unwrap().unwrap();
        let (tag, rest) = command.split_once(' ').unwrap();
        assert_eq!(rest, "AUTHENTICATE OAUTHBEARER");
        write.write_all(b"+ \r\n").await.unwrap();
        let response = lines.next_line().await.unwrap().unwrap();
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(response.trim())
            .unwrap();
        assert!(decoded.starts_with(b"n,a=alice@example.org,"));
        match error {
            None => write
                .write_all(format!("{tag} OK AUTHENTICATE completed\r\n").as_bytes())
                .await
                .unwrap(),
            Some(json) => {
                let challenge = base64::engine::general_purpose::STANDARD.encode(json);
                write
                    .write_all(format!("+ {challenge}\r\n").as_bytes())
                    .await
                    .unwrap();
                let answer = lines.next_line().await.unwrap().unwrap();
                assert_eq!(
                    base64::engine::general_purpose::STANDARD
                        .decode(answer.trim())
                        .unwrap(),
                    b"\x01"
                );
                write
                    .write_all(format!("{tag} NO [AUTHENTICATIONFAILED] failed\r\n").as_bytes())
                    .await
                    .unwrap();
            }
        }
        let _ = lines.next_line().await;
    });
    client
}

#[tokio::test]
async fn connect_authenticates_with_oauthbearer() {
    let token = Credential::OAuthBearer("tok".into());
    let client = async_imap::Client::new(oauthbearer_server(None).await);
    assert!(
        log_in(client, &stalwart(), "alice@example.org", &token)
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn a_failed_oauthbearer_attempt_tells_where_the_oauth_server_is() {
    let error = r#"{"status":"invalid_token","scope":"urn:ietf:params:oauth:scope:mail","openid-configuration":"https://mail.example.org/.well-known/openid-configuration"}"#;
    let client = async_imap::Client::new(oauthbearer_server(Some(error)).await);
    assert_eq!(
        probe(client, &stalwart(), "alice@example.org")
            .await
            .as_deref(),
        Some("https://mail.example.org/.well-known/openid-configuration")
    );
    let client =
        async_imap::Client::new(oauthbearer_server(Some(r#"{"status":"invalid_token"}"#)).await);
    assert_eq!(probe(client, &stalwart(), "alice@example.org").await, None);
}

#[tokio::test]
async fn connect_authenticates_with_xoauth2() {
    let token = Credential::AccessToken("tok".into());
    let client = async_imap::Client::new(xoauth2_server(true).await);
    assert!(
        log_in(client, &stalwart(), "alice@outlook.com", &token)
            .await
            .is_ok()
    );
    let client = async_imap::Client::new(xoauth2_server(false).await);
    assert!(matches!(
        log_in(client, &stalwart(), "alice@outlook.com", &token).await,
        Err(Error::Auth)
    ));
}

#[test]
fn uid_set_collapses_consecutive_uids() {
    assert_eq!(uid_set(&[7, 1, 2, 3, 5, 9, 8]), "1:3,5,7:9");
}

#[test]
fn roles_fall_back_to_localized_names() {
    assert_eq!(role_of("INBOX", &[]), Some(MailboxRole::Inbox));
    assert_eq!(role_of("INBOX.Envoy&AOk-s", &[]), Some(MailboxRole::Sent));
    assert_eq!(
        role_of("[Gmail]/Tous les messages", &[NameAttribute::All]),
        Some(MailboxRole::All)
    );
    assert_eq!(role_of("Projets", &[]), None);
}

#[test]
fn declared_and_shallow_mailboxes_win_a_role() {
    let mailbox = |remote_name: &str, depth| RemoteMailbox {
        remote_name: remote_name.into(),
        name: remote_name.into(),
        depth,
        role: role_of(remote_name, &[]),
        selectable: true,
    };
    let mut mailboxes = vec![
        mailbox("INBOX", 0),
        mailbox("INBOX.INBOX.Sent", 2),
        mailbox("INBOX.INBOX.Trash", 2),
        mailbox("INBOX.Sent Messages", 1),
        mailbox("INBOX.Trash", 1),
        mailbox("INBOX.Deleted Messages", 1),
    ];
    mailboxes[5].role = Some(MailboxRole::Trash);
    keep_one_mailbox_per_role(&mut mailboxes, &[false, false, false, false, false, true]);
    let roles: Vec<_> = mailboxes.iter().map(|mailbox| mailbox.role).collect();
    assert_eq!(
        roles,
        vec![
            Some(MailboxRole::Inbox),
            None,
            None,
            Some(MailboxRole::Sent),
            None,
            Some(MailboxRole::Trash),
        ]
    );
}

#[test]
fn large_appends_get_time_for_a_slow_uplink() {
    assert_eq!(transfer_timeout(0), NETWORK_TIMEOUT);
    assert!(transfer_timeout(34_000_000) >= Duration::from_secs(17 * 60));
}

async fn scripted_session(
    reply: &'static str,
    hang_up: bool,
) -> async_imap::Session<tokio::io::DuplexStream> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (client, server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(server);
        let mut read = BufReader::new(read);
        let mut line = String::new();
        let mut answered = false;
        while read.read_line(&mut line).await.unwrap_or(0) > 0 {
            let tag = line.split(' ').next().unwrap_or_default().to_owned();
            let answer = if line.contains(" LOGIN ") {
                format!("{tag} OK LOGIN completed\r\n")
            } else if line.contains("NOOP") {
                format!("{tag} OK NOOP completed\r\n")
            } else if !answered {
                answered = true;
                reply.replace("{tag}", &tag)
            } else {
                format!("{tag} BAD unexpected\r\n")
            };
            write.write_all(answer.as_bytes()).await.unwrap();
            if answered && hang_up {
                return;
            }
            line.clear();
        }
    });
    async_imap::Client::new(client)
        .login("alice", "secret")
        .await
        .map_err(|(error, _)| error)
        .unwrap()
}

#[tokio::test]
async fn a_select_cut_off_by_the_server_is_a_lost_connection_not_an_empty_mailbox() {
    let mut session = scripted_session("* 147 EXISTS\r\n", true).await;
    let result = select_complete(&mut session, "INBOX", false).await;
    assert!(matches!(result, Err(Error::Network(_))), "{result:?}");
}

#[tokio::test]
async fn a_complete_select_reports_its_uidvalidity() {
    let reply = "* 147 EXISTS\r\n* OK [UIDVALIDITY 1794294172] UIDs valid\r\n* OK [UIDNEXT 148] next\r\n{tag} OK [READ-WRITE] SELECT completed\r\n";
    let mut session = scripted_session(reply, false).await;
    let mailbox = select_complete(&mut session, "INBOX", false).await.unwrap();
    assert_eq!(
        (mailbox.exists, mailbox.uid_validity),
        (147, Some(1_794_294_172))
    );
}

#[tokio::test]
async fn the_selected_mailbox_status_includes_mail_delivered_since_it_was_selected() {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (client, server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(server);
        let mut read = BufReader::new(read);
        let mut line = String::new();
        let mut uid_next = 16;
        while read.read_line(&mut line).await.unwrap_or(0) > 0 {
            let tag = line.split(' ').next().unwrap_or_default().to_owned();
            let answer = if line.contains("NOOP") {
                uid_next = 17;
                format!("* 16 EXISTS\r\n{tag} OK NOOP completed\r\n")
            } else if line.contains("STATUS") {
                format!(
                    "* STATUS INBOX (MESSAGES {} UIDNEXT {uid_next} UIDVALIDITY 1)\r\n{tag} OK STATUS completed\r\n",
                    uid_next - 1
                )
            } else {
                format!("{tag} OK completed\r\n")
            };
            write.write_all(answer.as_bytes()).await.unwrap();
            line.clear();
        }
    });
    let mut session = async_imap::Client::new(client)
        .login("alice", "secret")
        .await
        .map_err(|(error, _)| error)
        .unwrap();
    let mailbox = status_complete(
        &mut session,
        "INBOX",
        "(MESSAGES UIDNEXT UIDVALIDITY)",
        true,
    )
    .await
    .unwrap();
    assert_eq!((mailbox.exists, mailbox.uid_next), (16, Some(17)));
}

#[tokio::test]
async fn a_search_cut_off_by_the_server_is_a_lost_connection_not_an_empty_result() {
    let mut session = scripted_session("", true).await;
    let result = search_complete(&mut session, "SINCE 01-Oct-2026".into()).await;
    assert!(matches!(result, Err(Error::Network(_))), "{result:?}");
}

#[tokio::test]
async fn a_search_that_found_nothing_stays_empty() {
    let mut session = scripted_session("* SEARCH\r\n{tag} OK SEARCH completed\r\n", false).await;
    let uids = search_complete(&mut session, "SINCE 01-Oct-2026".into())
        .await
        .unwrap();
    assert!(uids.is_empty());
}

#[tokio::test]
async fn append_waits_past_untagged_responses_for_the_continuation() {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (client, server) = tokio::io::duplex(4096);
    let server = tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(server);
        let mut read = BufReader::new(read);
        let mut line = String::new();
        read.read_line(&mut line).await.unwrap();
        let tag = line.split(' ').next().unwrap().to_owned();
        write
            .write_all(format!("{tag} OK LOGIN completed\r\n").as_bytes())
            .await
            .unwrap();
        line.clear();
        read.read_line(&mut line).await.unwrap();
        let tag = line.split(' ').next().unwrap().to_owned();
        assert!(line.ends_with("APPEND \"Sent\" (\\Seen) {5}\r\n"), "{line}");
        write
            .write_all(b"* 146 EXISTS\r\n* 1 RECENT\r\n+ Ready\r\n")
            .await
            .unwrap();
        let mut literal = [0u8; 7];
        read.read_exact(&mut literal).await.unwrap();
        write
            .write_all(format!("{tag} OK APPEND completed\r\n").as_bytes())
            .await
            .unwrap();
        literal
    });
    let mut session = async_imap::Client::new(client)
        .login("alice", "secret")
        .await
        .map_err(|(error, _)| error)
        .unwrap();

    append_seen(&mut session, "Sent", b"hello").await.unwrap();

    assert_eq!(&server.await.unwrap(), b"hello\r\n");
}

#[test]
fn a_server_preview_is_read_past_a_header_literal_that_mentions_it() {
    let header = "Subject: PREVIEW \"fake\"\r\n\r\n";
    let raw = format!(
        "* 1 FETCH (UID 7 FLAGS (\\Seen) BODY[HEADER.FIELDS (SUBJECT DATE)] {{{}}}\r\n{header} PREVIEW \"Hello \\\"Carol\\\" \\\\o/\")\r\n",
        header.len()
    );
    assert_eq!(
        preview_in(raw.as_bytes()).as_deref(),
        Some("Hello \"Carol\" \\o/")
    );
}

#[test]
fn a_server_preview_can_come_as_a_literal_or_be_nil() {
    let text = "Déjà vu";
    let literal = format!("* 2 FETCH (PREVIEW {{{}}}\r\n{text} UID 8)\r\n", text.len());
    assert_eq!(preview_in(literal.as_bytes()).as_deref(), Some(text));
    assert_eq!(preview_in(b"* 3 FETCH (UID 9 PREVIEW NIL)\r\n"), None);
    assert_eq!(preview_in(b"* 4 FETCH (UID 10 FLAGS ())\r\n"), None);
}

#[tokio::test]
async fn summaries_take_the_preview_the_server_made() {
    let reply = "* 1 FETCH (UID 7 FLAGS (\\Seen) INTERNALDATE \"24-Nov-2026 10:00:00 +0000\" RFC822.SIZE 2900 BODY[HEADER.FIELDS (SUBJECT)] {21}\r\nSubject: Hi there\r\n\r\n PREVIEW \"Lunch at noon?\")\r\n* 2 FETCH (UID 99 FLAGS (\\Flagged))\r\n{tag} OK FETCH completed\r\n";
    let mut session = scripted_session(reply, false).await;
    let summaries = timed(fetch_summaries_with_preview(&mut session, &[7]))
        .await
        .unwrap();
    assert_eq!(summaries.len(), 1);
    let summary = &summaries[0];
    assert_eq!((summary.uid, summary.size), (7, 2900));
    assert!(summary.flags.seen && !summary.flags.flagged);
    assert_eq!(summary.internal_date, Some(1_795_514_400_000));
    assert_eq!(summary.header, b"Subject: Hi there\r\n\r\n");
    assert!(summary.text.is_empty());
    assert_eq!(summary.preview.as_deref(), Some("Lunch at noon?"));
}

#[tokio::test]
async fn a_message_answered_in_several_fetch_responses_makes_one_summary() {
    let reply = "* 1 FETCH (UID 7 RFC822.SIZE 2900 BODY[HEADER.FIELDS (SUBJECT)] {21}\r\nSubject: Hi there\r\n\r\n)\r\n* 1 FETCH (UID 7 FLAGS (\\Seen) PREVIEW \"Lunch at noon?\")\r\n{tag} OK FETCH completed\r\n";
    let mut session = scripted_session(reply, false).await;
    let summaries = timed(fetch_summaries_with_preview(&mut session, &[7]))
        .await
        .unwrap();
    assert_eq!(summaries.len(), 1);
    assert!(summaries[0].flags.seen);
    assert_eq!(summaries[0].header, b"Subject: Hi there\r\n\r\n");
    assert_eq!(summaries[0].preview.as_deref(), Some("Lunch at noon?"));
}

#[tokio::test]
async fn a_refused_preview_fetch_is_a_server_error() {
    let mut session = scripted_session("{tag} NO [SERVERBUG] preview failed\r\n", false).await;
    let result = timed(fetch_summaries_with_preview(&mut session, &[7])).await;
    assert!(matches!(result, Err(Error::Server(_))), "{result:?}");
}
