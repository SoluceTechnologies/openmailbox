use mail_model::{
    Address, FetchedMessage, Flags, MAX_ATTACHMENTS_BYTES, MailboxRole, NewMessage,
    OutgoingAttachment, ParsedHeaders, RemoteMailbox, RenderedBody, ThreadScope, Unsubscribe,
    UnsubscribeOutcome, now_millis,
};

use super::*;
use crate::test_support::account;

struct Fixture {
    engine: Arc<Engine>,
    _runtime: tokio::runtime::Runtime,
}

impl Fixture {
    fn new(roles: &[(&str, MailboxRole)]) -> Fixture {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let directory =
            std::env::temp_dir().join(format!("mail-sync-engine-{}", uuid::Uuid::new_v4()));
        let engine = Engine::open(&directory, runtime.handle().clone()).unwrap();
        engine.store.insert_account(&account("alice")).unwrap();
        let mailboxes: Vec<RemoteMailbox> = roles
            .iter()
            .map(|(name, role)| RemoteMailbox {
                remote_name: (*name).into(),
                name: (*name).into(),
                depth: 0,
                role: Some(*role),
                selectable: true,
            })
            .collect();
        engine.store.replace_mailboxes("alice", &mailboxes).unwrap();
        Fixture {
            engine,
            _runtime: runtime,
        }
    }

    fn id(&self, role: MailboxRole) -> i64 {
        self.engine
            .store
            .mailbox_by_role("alice", role)
            .unwrap()
            .unwrap()
            .id
    }

    fn deliver(&self, mailbox_id: i64, uid: u32) -> (i64, Vec<i64>) {
        let headers = ParsedHeaders {
            message_id: Some(format!("{uid}@example.org")),
            from: vec![Address {
                name: None,
                email: "bob@example.org".into(),
            }],
            ..ParsedHeaders::default()
        };
        self.engine
            .store
            .insert_messages(
                "alice",
                mailbox_id,
                &[FetchedMessage {
                    uid,
                    flags: Flags::default(),
                    internal_date: Some(1),
                    size: 1,
                    headers,
                }],
            )
            .unwrap();
        let thread_id = self.threads(mailbox_id)[0];
        (
            thread_id,
            self.engine
                .store
                .thread_email_ids(mailbox_id, thread_id)
                .unwrap(),
        )
    }

    fn deliver_at(&self, uid: u32, received_at: i64, seen: bool) {
        deliver_to(&self.engine.store, "alice", uid, received_at, seen);
    }

    fn check(&self) -> Vec<NewMessage> {
        self._runtime
            .block_on(self.engine.check_new_mail(Duration::from_secs(5)))
            .unwrap()
    }

    fn threads(&self, mailbox_id: i64) -> Vec<i64> {
        self.engine
            .store
            .list_threads(
                ThreadScope::Mailbox(mailbox_id),
                &ThreadFilter::default(),
                None,
                None,
                50,
            )
            .unwrap()
            .threads
            .into_iter()
            .map(|thread| thread.thread_id)
            .collect()
    }
}

fn deliver_to(store: &Store, account_id: &str, uid: u32, received_at: i64, seen: bool) {
    let inbox = store
        .mailbox_by_role(account_id, MailboxRole::Inbox)
        .unwrap()
        .unwrap()
        .id;
    store
        .insert_messages(
            account_id,
            inbox,
            &[FetchedMessage {
                uid,
                flags: Flags {
                    seen,
                    ..Flags::default()
                },
                internal_date: Some(received_at),
                size: 1,
                headers: ParsedHeaders {
                    message_id: Some(format!("{account_id}-{uid}@example.org")),
                    subject: Some(format!("Message {uid}")),
                    from: vec![Address {
                        name: None,
                        email: "bob@example.org".into(),
                    }],
                    ..ParsedHeaders::default()
                },
            }],
        )
        .unwrap();
}

const STANDARD: &[(&str, MailboxRole)] = &[
    ("INBOX", MailboxRole::Inbox),
    ("Archive", MailboxRole::Archive),
    ("Junk", MailboxRole::Junk),
    ("Trash", MailboxRole::Trash),
];

#[test]
fn a_worker_busy_since_before_the_app_was_suspended_is_replaced() {
    let fixture = Fixture::new(STANDARD);
    fixture.engine.start_worker(account("alice"), None, None);
    let heartbeat = |engine: &Engine| engine.accounts()["alice"].heartbeat.clone();
    let stuck = heartbeat(&fixture.engine);
    stuck.store(1_000, Ordering::SeqCst);

    fixture.engine.restart_stalled_workers(500);
    assert!(Arc::ptr_eq(&stuck, &heartbeat(&fixture.engine)));

    fixture.engine.restart_stalled_workers(2_000);
    assert!(!Arc::ptr_eq(&stuck, &heartbeat(&fixture.engine)));
}

#[test]
fn resolves_inbox_and_junk_by_role() {
    let fixture = Fixture::new(STANDARD);
    let (inbox, junk) = (
        fixture.id(MailboxRole::Inbox),
        fixture.id(MailboxRole::Junk),
    );
    let (thread_id, _) = fixture.deliver(inbox, 7);

    let to_junk = fixture
        .engine
        .move_thread(inbox, thread_id, Destination::Junk, Duration::ZERO)
        .unwrap();
    assert_eq!(to_junk.target_mailbox_id, Some(junk));

    let back = fixture
        .engine
        .move_thread(junk, thread_id, Destination::Inbox, Duration::ZERO)
        .unwrap();
    assert_eq!(back.target_mailbox_id, Some(inbox));
    assert_eq!(fixture.threads(inbox), vec![thread_id]);
}

#[test]
fn moving_to_junk_without_a_junk_folder_is_refused() {
    let fixture = Fixture::new(&[("INBOX", MailboxRole::Inbox), ("Trash", MailboxRole::Trash)]);
    let inbox = fixture.id(MailboxRole::Inbox);
    let (thread_id, _) = fixture.deliver(inbox, 7);

    let result = fixture
        .engine
        .move_thread(inbox, thread_id, Destination::Junk, Duration::ZERO);
    assert!(matches!(result, Err(Error::InvalidInput(_))));
}

#[test]
fn held_move_waits_until_the_hold_ends() {
    let fixture = Fixture::new(STANDARD);
    let inbox = fixture.id(MailboxRole::Inbox);
    let (thread_id, _) = fixture.deliver(inbox, 7);
    let now = now_millis();

    fixture
        .engine
        .move_thread(inbox, thread_id, Destination::Trash, Duration::from_secs(5))
        .unwrap();

    let store = &fixture.engine.store;
    assert!(store.due_operations("alice", now).unwrap().is_empty());
    assert_eq!(store.due_operations("alice", now + 5_100).unwrap().len(), 1);
}

#[test]
fn moving_back_before_the_hold_ends_cancels_the_move() {
    let fixture = Fixture::new(STANDARD);
    let (inbox, trash) = (
        fixture.id(MailboxRole::Inbox),
        fixture.id(MailboxRole::Trash),
    );
    let (thread_id, _) = fixture.deliver(inbox, 7);

    let relocation = fixture
        .engine
        .move_thread(inbox, thread_id, Destination::Trash, Duration::from_secs(5))
        .unwrap();
    fixture
        .engine
        .move_emails(
            &relocation.email_ids,
            trash,
            Destination::Mailbox(inbox),
            Duration::ZERO,
        )
        .unwrap();

    let pending_sources: usize = fixture
        .engine
        .store
        .waiting_operations("alice", "move")
        .unwrap()
        .into_iter()
        .map(
            |operation| match serde_json::from_str(&operation.payload).unwrap() {
                Operation::Move { sources, .. } => sources.len(),
                _ => 0,
            },
        )
        .sum();
    assert_eq!(pending_sources, 0);
    assert_eq!(fixture.threads(inbox), vec![thread_id]);
    assert!(fixture.threads(trash).is_empty());
}

#[test]
fn move_returns_the_moved_emails_and_target() {
    let fixture = Fixture::new(STANDARD);
    let (inbox, trash) = (
        fixture.id(MailboxRole::Inbox),
        fixture.id(MailboxRole::Trash),
    );
    let (thread_id, email_ids) = fixture.deliver(inbox, 7);

    let relocation = fixture
        .engine
        .move_thread(inbox, thread_id, Destination::Trash, Duration::ZERO)
        .unwrap();
    assert_eq!(relocation.email_ids, email_ids);
    assert_eq!(relocation.target_mailbox_id, Some(trash));

    let deletion = fixture
        .engine
        .move_thread(trash, thread_id, Destination::Trash, Duration::ZERO)
        .unwrap();
    assert_eq!(deletion.email_ids, email_ids);
    assert_eq!(deletion.target_mailbox_id, None);
}

fn draft_with(attachments: Vec<OutgoingAttachment>) -> Draft {
    Draft {
        account_id: "alice".into(),
        to: vec![Address {
            name: None,
            email: "bob@example.org".into(),
        }],
        cc: vec![],
        bcc: vec![],
        subject: "Documents".into(),
        body_text: "Voici.".into(),
        body_html: None,
        in_reply_to_email_id: None,
        attachments,
        from: None,
        calendar: None,
    }
}

fn file_of_size(size: u64) -> String {
    let path = std::env::temp_dir().join(format!("attachment-{}", uuid::Uuid::new_v4()));
    std::fs::File::create(&path).unwrap().set_len(size).unwrap();
    path.to_string_lossy().into_owned()
}

#[test]
fn send_rejects_attachments_over_25_megabytes() {
    let fixture = Fixture::new(STANDARD);
    let attachment = |size| OutgoingAttachment {
        path: file_of_size(size),
        filename: "scan.pdf".into(),
        mime_type: "application/pdf".into(),
    };
    let result = fixture.engine.send(draft_with(vec![
        attachment(MAX_ATTACHMENTS_BYTES - 10),
        attachment(11),
    ]));
    assert!(matches!(result, Err(Error::InvalidInput(_))));
    assert!(
        fixture
            .engine
            .store
            .waiting_operations("alice", "send")
            .unwrap()
            .is_empty()
    );
}

#[test]
fn send_reports_a_missing_attachment_file() {
    let fixture = Fixture::new(STANDARD);
    let result = fixture.engine.send(draft_with(vec![OutgoingAttachment {
        path: "/nonexistent/contrat.pdf".into(),
        filename: "contrat.pdf".into(),
        mime_type: "application/pdf".into(),
    }]));
    assert!(matches!(result, Err(Error::InvalidInput(message)) if message.contains("contrat.pdf")));
}

#[test]
fn send_queues_a_message_carrying_its_attachments() {
    let fixture = Fixture::new(STANDARD);
    fixture
        .engine
        .send(draft_with(vec![OutgoingAttachment {
            path: file_of_size(2_048),
            filename: "plan.pdf".into(),
            mime_type: "application/pdf".into(),
        }]))
        .unwrap();
    let queued = fixture
        .engine
        .store
        .waiting_operations("alice", "send")
        .unwrap();
    let Operation::Send { raw, .. } = serde_json::from_str(&queued[0].payload).unwrap() else {
        panic!("not a send");
    };
    let rendered = mail_mime::render(raw.as_bytes()).unwrap();
    assert_eq!(rendered.attachments[0].filename, "plan.pdf");
    assert_eq!(rendered.attachments[0].size, 2_048);
}

#[test]
fn send_from_an_identity_uses_it_as_sender_and_envelope() {
    let fixture = Fixture::new(STANDARD);
    let mut draft = draft_with(vec![]);
    draft.from = Some(Address {
        name: Some("Support".into()),
        email: "info@shop.example".into(),
    });
    fixture.engine.send(draft).unwrap();
    let queued = fixture
        .engine
        .store
        .waiting_operations("alice", "send")
        .unwrap();
    let Operation::Send {
        raw, envelope_from, ..
    } = serde_json::from_str(&queued[0].payload).unwrap()
    else {
        panic!("not a send");
    };
    assert_eq!(envelope_from, "info@shop.example");
    assert!(raw.contains("From: Support <info@shop.example>"));
    assert!(
        raw.lines()
            .any(|line| line.starts_with("Message-ID:") && line.ends_with("@shop.example>"))
    );
}

fn newsletter(fixture: &Fixture, unsubscribe: Unsubscribe) -> i64 {
    let (_, email_ids) = fixture.deliver(fixture.id(MailboxRole::Inbox), 9);
    fixture
        .engine
        .store
        .save_body(
            email_ids[0],
            &RenderedBody {
                html: None,
                text: "News".into(),
                has_remote_content: false,
                attachments: vec![],
                unsubscribe: Some(unsubscribe),
                calendar: None,
            },
        )
        .unwrap();
    email_ids[0]
}

#[test]
fn one_click_unsubscribe_posts_the_form() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut chunk = [0; 1024];
        loop {
            let read = stream.read(&mut chunk).unwrap();
            request.extend_from_slice(&chunk[..read]);
            let text = String::from_utf8_lossy(&request).into_owned();
            let Some((head, body)) = text.split_once("\r\n\r\n") else {
                continue;
            };
            let length = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|value| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            if body.len() >= length || read == 0 {
                break;
            }
        }
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .unwrap();
        String::from_utf8_lossy(&request).into_owned()
    });
    let fixture = Fixture::new(STANDARD);
    let email_id = newsletter(
        &fixture,
        Unsubscribe {
            https_url: Some(format!("http://127.0.0.1:{port}/u?id=1")),
            mailto: None,
            one_click: true,
        },
    );

    let outcome = fixture.engine.unsubscribe(email_id).unwrap();

    let request = server.join().unwrap();
    assert_eq!(outcome, UnsubscribeOutcome::Done);
    assert!(request.starts_with("POST /u?id=1 "));
    assert!(request.ends_with("List-Unsubscribe=One-Click"));
}

#[test]
fn mailto_unsubscribe_queues_a_message() {
    let fixture = Fixture::new(STANDARD);
    let email_id = newsletter(
        &fixture,
        Unsubscribe {
            https_url: None,
            mailto: Some("mailto:leave@x.example?subject=stop%20now".into()),
            one_click: false,
        },
    );

    let outcome = fixture.engine.unsubscribe(email_id).unwrap();

    assert_eq!(outcome, UnsubscribeOutcome::Done);
    let queued = fixture
        .engine
        .store
        .waiting_operations("alice", "send")
        .unwrap();
    let Operation::Send {
        raw, recipients, ..
    } = serde_json::from_str(&queued[0].payload).unwrap()
    else {
        panic!("not a send");
    };
    assert_eq!(recipients, vec!["leave@x.example"]);
    assert!(raw.contains("Subject: stop now"));
    assert!(
        fixture
            .engine
            .suggest_addresses("leave", 5)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_one_click_unsubscribe_that_fails_opens_the_list_page() {
    let fixture = Fixture::new(STANDARD);
    let email_id = newsletter(
        &fixture,
        Unsubscribe {
            https_url: Some("http://127.0.0.1:9/unsubscribe".into()),
            mailto: None,
            one_click: true,
        },
    );

    assert_eq!(
        fixture.engine.unsubscribe(email_id).unwrap(),
        UnsubscribeOutcome::OpenInBrowser {
            url: "http://127.0.0.1:9/unsubscribe".into()
        }
    );
}

#[test]
fn web_only_unsubscribe_asks_the_app_to_open_it() {
    let fixture = Fixture::new(STANDARD);
    let email_id = newsletter(
        &fixture,
        Unsubscribe {
            https_url: Some("https://x.example/u".into()),
            mailto: None,
            one_click: false,
        },
    );

    assert_eq!(
        fixture.engine.unsubscribe(email_id).unwrap(),
        UnsubscribeOutcome::OpenInBrowser {
            url: "https://x.example/u".into()
        }
    );
}

#[test]
fn sending_makes_recipients_suggestions() {
    let fixture = Fixture::new(STANDARD);
    fixture.engine.send(draft_with(vec![])).unwrap();
    assert_eq!(
        fixture.engine.suggest_addresses("bob", 8).unwrap()[0].email,
        "bob@example.org"
    );
}

fn subjects(found: &[NewMessage]) -> Vec<String> {
    found
        .iter()
        .map(|message| message.email.subject.clone().unwrap_or_default())
        .collect()
}

#[test]
fn returns_each_new_unread_message_once() {
    let fixture = Fixture::new(STANDARD);
    fixture.deliver_at(1, 100, false);
    fixture.deliver_at(2, 200, true);
    fixture.deliver_at(3, 300, false);

    assert_eq!(subjects(&fixture.check()), vec!["Message 1", "Message 3"]);
    assert!(fixture.check().is_empty());

    fixture.deliver_at(4, 400, false);
    assert_eq!(subjects(&fixture.check()), vec!["Message 4"]);
}

#[test]
fn notifies_mail_received_in_the_same_second_as_the_last_check() {
    let fixture = Fixture::new(STANDARD);
    fixture.deliver_at(1, 100_000, false);
    assert_eq!(subjects(&fixture.check()), vec!["Message 1"]);

    fixture.deliver_at(2, 100_000, false);
    assert_eq!(subjects(&fixture.check()), vec!["Message 2"]);
    assert!(fixture.check().is_empty());
}

#[test]
fn older_mail_synced_late_is_not_notified() {
    let fixture = Fixture::new(STANDARD);
    fixture.deliver_at(1, 100_000, false);
    fixture.check();
    fixture.deliver_at(2, 50_000, false);
    assert!(fixture.check().is_empty());
}

#[test]
fn going_to_background_skips_mail_already_in_the_app() {
    let fixture = Fixture::new(STANDARD);
    fixture.deliver_at(1, 100, false);
    fixture.engine.on_background();
    assert!(fixture.check().is_empty());
}

#[test]
fn mail_present_when_an_account_is_added_is_not_notified() {
    let fixture = Fixture::new(STANDARD);
    fixture.deliver_at(1, now_millis() - 60_000, false);
    fixture
        .engine
        .store
        .set_notified_until("alice", now_millis())
        .unwrap();
    assert!(fixture.check().is_empty());
}

#[test]
fn an_unreachable_account_does_not_hide_the_others() {
    let directory = std::env::temp_dir().join(format!("mail-sync-check-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    {
        let store = Store::open(&directory.join("mail.db")).unwrap();
        let mut unreachable = account("carol");
        unreachable.imap = mail_model::ServerEndpoint {
            host: "127.0.0.1".into(),
            port: 9,
            security: mail_model::Security::Tls,
        };
        store.insert_account(&unreachable).unwrap();
        store.insert_account(&account("alice")).unwrap();
        store
            .replace_mailboxes(
                "alice",
                &[RemoteMailbox {
                    remote_name: "INBOX".into(),
                    name: "INBOX".into(),
                    depth: 0,
                    role: Some(MailboxRole::Inbox),
                    selectable: true,
                }],
            )
            .unwrap();
        deliver_to(&store, "alice", 1, 100, false);
    }
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let engine = Engine::open(&directory, runtime.handle().clone()).unwrap();
    engine.unlock_account("carol", "secret".into());

    let started = std::time::Instant::now();
    let found = runtime
        .block_on(engine.check_new_mail(Duration::from_secs(5)))
        .unwrap();

    assert_eq!(subjects(&found), vec!["Message 1"]);
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn a_mail_server_refusing_a_fresh_token_names_itself_and_the_address() {
    assert!(matches!(
        refused_sign_in(Error::Auth, "outlook.office365.com", "alice@gmail.com"),
        Error::Server(message)
            if message == "outlook.office365.com refused the sign-in of alice@gmail.com"
    ));
    assert!(matches!(
        refused_sign_in(Error::Network("down".into()), "smtp.office365.com", "a@b.c"),
        Error::Network(message) if message == "down"
    ));
}

#[test]
fn an_address_already_added_is_refused_before_connecting() {
    let directory =
        std::env::temp_dir().join(format!("mail-sync-duplicate-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    Store::open(&directory.join("mail.db"))
        .unwrap()
        .insert_account(&account("carol"))
        .unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let engine = Engine::open(&directory, runtime.handle().clone()).unwrap();
    let unreachable = mail_model::ServerEndpoint {
        host: "unreachable.invalid".into(),
        port: 993,
        security: mail_model::Security::Tls,
    };
    let config = AccountConfig {
        email: " Carol@Example.com ".into(),
        display_name: "Carol".into(),
        username: "carol".into(),
        smtp_username: None,
        imap: unreachable.clone(),
        smtp: unreachable,
    };
    assert!(matches!(
        runtime.block_on(engine.add_account(config, "secret".into(), None)),
        Err(Error::AccountExists)
    ));
    assert_eq!(engine.list_accounts().unwrap().len(), 1);
}

#[test]
fn an_account_signs_in_again_where_it_first_signed_in() {
    let directory = std::env::temp_dir().join(format!("mail-sync-again-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    {
        let store = Store::open(&directory.join("mail.db")).unwrap();
        let mut server = account("server");
        server.authentication = Authentication::Server;
        server.oauth_server = Some(mail_model::OAuthServer {
            issuer: "https://mail.example.org".into(),
            authorization_endpoint: "https://mail.example.org/login".into(),
            token_endpoint: "https://mail.example.org/auth/token".into(),
            client_id: "swc1.abc".into(),
        });
        store.insert_account(&server).unwrap();
        let mut microsoft = account("microsoft");
        microsoft.authentication = Authentication::Microsoft;
        store.insert_account(&microsoft).unwrap();
        store.insert_account(&account("password")).unwrap();
    }
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let engine = Engine::open(&directory, runtime.handle().clone()).unwrap();
    let query = |url: &str| -> std::collections::HashMap<String, String> {
        url::Url::parse(url)
            .unwrap()
            .query_pairs()
            .into_owned()
            .collect()
    };

    let server = engine.begin_account_sign_in("server").unwrap();
    assert!(server.url.starts_with("https://mail.example.org/login?"));
    assert_eq!(query(&server.url)["client_id"], "swc1.abc");
    assert_eq!(query(&server.url)["login_hint"], "server@example.com");
    assert_eq!(server.redirect_uri, "com.soluce.openmailbox:/oauth");

    let microsoft = engine.begin_account_sign_in("microsoft").unwrap();
    assert!(
        microsoft
            .url
            .starts_with("https://login.microsoftonline.com/")
    );
    assert_eq!(query(&microsoft.url)["login_hint"], "microsoft@example.com");

    assert!(matches!(
        engine.begin_account_sign_in("password"),
        Err(Error::InvalidInput(_))
    ));
}

#[test]
fn an_oauth_sign_in_only_accepts_the_answer_to_its_own_request() {
    let directory = std::env::temp_dir().join(format!("mail-sync-oauth-{}", uuid::Uuid::new_v4()));
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let engine = Engine::open(&directory, runtime.handle().clone()).unwrap();
    assert!(matches!(
        runtime.block_on(engine.add_oauth_account("openmailbox://oauth?code=x&state=y", "")),
        Err(Error::InvalidInput(_))
    ));
    engine
        .begin_sign_in(Authentication::Microsoft, None)
        .unwrap();
    assert!(matches!(
        runtime.block_on(engine.add_oauth_account("openmailbox://oauth?code=x&state=forged", "")),
        Err(Error::InvalidInput(_))
    ));
    assert!(engine.list_accounts().unwrap().is_empty());
}

const TINY_JXL: [u8; 42] = [
    0xff, 0x0a, 0x30, 0x54, 0x10, 0x09, 0x08, 0x06, 0x01, 0x00, 0x78, 0x00, 0x4b, 0x38, 0x41, 0x3c,
    0xb6, 0x3a, 0x51, 0xfe, 0x00, 0x47, 0x1e, 0xa0, 0x85, 0xb8, 0x27, 0x1a, 0x48, 0x45, 0x84, 0x1b,
    0x71, 0x4f, 0xa8, 0x3e, 0x8e, 0x30, 0x03, 0x92, 0x84, 0x01,
];

#[test]
fn writes_a_png_next_to_a_saved_jpeg_xl_attachment() {
    let directory = std::env::temp_dir().join(format!("mail-sync-jxl-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let saved = directory.join("photo.jxl");
    std::fs::write(&saved, TINY_JXL).unwrap();

    let readable = readable_image(&saved).unwrap().unwrap();

    assert_eq!(readable, directory.join("photo.png").to_string_lossy());
    assert!(
        std::fs::read(&readable)
            .unwrap()
            .starts_with(b"\x89PNG\r\n\x1a\n")
    );
    assert_eq!(std::fs::read(&saved).unwrap(), TINY_JXL);
}

#[test]
fn writes_a_png_next_to_a_saved_tiff_scan() {
    let directory = std::env::temp_dir().join(format!("mail-sync-tiff-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let saved = directory.join("scan.tif");
    let mut tiff = std::io::Cursor::new(Vec::new());
    tiff::encoder::TiffEncoder::new(&mut tiff)
        .unwrap()
        .write_image::<tiff::encoder::colortype::Gray8>(2, 2, &[0, 80, 160, 255])
        .unwrap();
    std::fs::write(&saved, tiff.into_inner()).unwrap();

    let readable = readable_image(&saved).unwrap().unwrap();

    assert_eq!(readable, directory.join("scan.png").to_string_lossy());
    assert!(
        std::fs::read(&readable)
            .unwrap()
            .starts_with(b"\x89PNG\r\n\x1a\n")
    );
}

#[test]
fn leaves_other_saved_attachments_as_they_are() {
    let saved = std::env::temp_dir().join(format!("mail-sync-pdf-{}.pdf", uuid::Uuid::new_v4()));
    std::fs::write(&saved, b"%PDF-1.7").unwrap();
    assert_eq!(readable_image(&saved).unwrap(), None);
}

#[test]
fn saves_an_attachment_of_a_saved_message() {
    let directory = std::env::temp_dir().join(format!("mail-sync-eml-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let saved = directory.join("Original quote.eml");
    std::fs::write(
        &saved,
        "From: a@example.com\r\nSubject: Quote\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"i\"\r\n\r\n--i\r\nContent-Type: text/plain\r\n\r\nHi\r\n--i\r\nContent-Type: application/pdf; name=\"quote.pdf\"\r\nContent-Disposition: attachment; filename=\"quote.pdf\"\r\n\r\n%PDF-1.7\r\n--i--\r\n",
    )
    .unwrap();

    let path = save_attachment_from_file(&saved, 0, &directory).unwrap();

    assert!(path.ends_with("/quote.pdf"));
    assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-1.7");
    assert!(matches!(
        save_attachment_from_file(&saved, 5, &directory),
        Err(Error::NotFound)
    ));
}
