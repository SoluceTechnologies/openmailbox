use std::sync::Arc;
use std::time::{Duration, Instant};

use mail_model::{
    AccountConfig, Address, Draft, Keyword, MailboxRole, OutgoingAttachment, Security,
    ServerEndpoint, ThreadScope, ThreadSummary,
};
use mail_sync::{Destination, Engine};

fn endpoint(port: u16) -> ServerEndpoint {
    ServerEndpoint {
        host: "localhost".into(),
        port,
        security: Security::Tls,
    }
}

fn bob() -> Address {
    Address {
        name: Some("Bob".into()),
        email: "bob@example.com".into(),
    }
}

fn draft(
    account_id: &str,
    subject: String,
    body_text: &str,
    in_reply_to_email_id: Option<i64>,
) -> Draft {
    Draft {
        account_id: account_id.into(),
        to: vec![bob()],
        cc: vec![],
        bcc: vec![],
        subject,
        body_text: body_text.into(),
        in_reply_to_email_id,
        attachments: vec![],
    }
}

async fn server_subjects() -> Vec<String> {
    server_subjects_in("INBOX").await
}

async fn server_subjects_in(mailbox: &str) -> Vec<String> {
    let mut connection = proto_imap::connect(&endpoint(3993), "bob@example.com", "secret")
        .await
        .unwrap();
    connection.select(mailbox).await.unwrap();
    let uids = connection.search_since(0).await.unwrap();
    if uids.is_empty() {
        return Vec::new();
    }
    connection
        .fetch_summaries(&uids)
        .await
        .unwrap_or_default()
        .iter()
        .filter(|summary| !summary.flags.deleted)
        .filter_map(|summary| mail_mime::parse_summary(&summary.header, &summary.text).subject)
        .collect()
}

async fn ensure_mailboxes() {
    let mut connection = proto_imap::connect(&endpoint(3993), "bob@example.com", "secret")
        .await
        .unwrap();
    let mailboxes = connection.list_mailboxes().await.unwrap();
    for (name, role) in [
        ("Sent", MailboxRole::Sent),
        ("Trash", MailboxRole::Trash),
        ("Junk", MailboxRole::Junk),
    ] {
        if !mailboxes.iter().any(|mailbox| mailbox.role == Some(role)) {
            let _ = connection.create_mailbox(name).await;
        }
    }
}

async fn wait_on_server(mailbox: &str, token: &str, present: bool) {
    let started = Instant::now();
    while server_subjects_in(mailbox)
        .await
        .iter()
        .any(|subject| subject.contains(token))
        != present
    {
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "{mailbox} did not change on the server"
        );
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

async fn eventually<T>(engine: &Engine, mut probe: impl FnMut() -> Option<T>) -> T {
    let started = Instant::now();
    let mut last_sync = Instant::now();
    loop {
        if let Some(value) = probe() {
            return value;
        }
        assert!(
            started.elapsed() < Duration::from_secs(30),
            "condition not reached in time"
        );
        if last_sync.elapsed() > Duration::from_secs(2) {
            engine.sync_now(None);
            last_sync = Instant::now();
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

fn thread_with(engine: &Engine, token: &str) -> Option<ThreadSummary> {
    engine
        .list_threads(ThreadScope::Unified, false, None, 100)
        .unwrap()
        .threads
        .into_iter()
        .find(|thread| {
            thread
                .latest
                .subject
                .as_deref()
                .is_some_and(|subject| subject.contains(token))
        })
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires tools/mail-server/mail-server.sh and the test-ca feature"]
async fn sends_syncs_reads_and_acts_on_a_real_server() {
    ensure_mailboxes().await;
    let directory =
        std::env::temp_dir().join(format!("openmailbox-greenmail-{}", uuid::Uuid::new_v4()));
    let engine = Engine::open(&directory, tokio::runtime::Handle::current()).unwrap();
    engine.set_event_sink(Arc::new(|_| {}));
    engine.on_foreground();
    let account = engine
        .add_account(
            AccountConfig {
                email: "bob@example.com".into(),
                display_name: "Bob".into(),
                username: "bob@example.com".into(),
                imap: endpoint(3993),
                smtp: endpoint(3465),
            },
            "secret".into(),
        )
        .await
        .unwrap();

    let token = uuid::Uuid::new_v4().simple().to_string();
    engine
        .send(draft(
            &account.id,
            format!("Hello {token}"),
            "Premier message",
            None,
        ))
        .unwrap();
    let thread = eventually(&engine, || thread_with(&engine, &token)).await;
    assert_eq!(thread.latest.preview.as_deref(), Some("Premier message"));
    let first = engine
        .thread_emails(thread.thread_id, Some(thread.mailbox_id))
        .unwrap()
        .remove(0);
    let body = engine.body(first.id).await.unwrap();
    assert!(body.text.contains("Premier message"));

    engine
        .send(draft(
            &account.id,
            format!("Re: Hello {token}"),
            "Réponse",
            Some(first.id),
        ))
        .unwrap();
    let thread = eventually(&engine, || {
        thread_with(&engine, &token)
            .filter(|thread| thread.message_count == 2 && thread.unread_count == 0)
    })
    .await;

    engine
        .set_thread_keywords(thread.mailbox_id, thread.thread_id, &[], &[Keyword::Seen])
        .unwrap();
    tokio::time::sleep(Duration::from_secs(1)).await;
    engine.sync_now(None);
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert_eq!(
        thread_with(&engine, &token).unwrap().unread_count,
        2,
        "the read copy in Sent was marked unread too"
    );

    engine
        .set_thread_keywords(thread.mailbox_id, thread.thread_id, &[Keyword::Seen], &[])
        .unwrap();
    tokio::time::sleep(Duration::from_secs(1)).await;
    engine.sync_now(None);
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert_eq!(
        thread_with(&engine, &token).unwrap().unread_count,
        0,
        "seen flags reached the server"
    );

    engine
        .move_thread(
            thread.mailbox_id,
            thread.thread_id,
            Destination::Trash,
            Duration::ZERO,
        )
        .unwrap();
    assert!(thread_with(&engine, &token).is_none());
    let started = Instant::now();
    while server_subjects()
        .await
        .iter()
        .any(|subject| subject.contains(&token))
    {
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "deletion did not reach the server"
        );
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires tools/mail-server/mail-server.sh and the test-ca feature"]
async fn deleting_an_unopened_thread_removes_it_from_the_server() {
    let directory =
        std::env::temp_dir().join(format!("openmailbox-greenmail-{}", uuid::Uuid::new_v4()));
    let engine = Engine::open(&directory, tokio::runtime::Handle::current()).unwrap();
    engine.set_event_sink(Arc::new(|_| {}));
    engine.on_foreground();
    let account = engine
        .add_account(
            AccountConfig {
                email: "bob@example.com".into(),
                display_name: "Bob".into(),
                username: "bob@example.com".into(),
                imap: endpoint(3993),
                smtp: endpoint(3465),
            },
            "secret".into(),
        )
        .await
        .unwrap();
    let token = uuid::Uuid::new_v4().simple().to_string();
    engine
        .send(draft(&account.id, format!("Delete {token}"), "Body", None))
        .unwrap();
    let thread = eventually(&engine, || thread_with(&engine, &token)).await;
    tokio::time::sleep(Duration::from_secs(4)).await;

    engine
        .move_thread(
            thread.mailbox_id,
            thread.thread_id,
            Destination::Trash,
            Duration::ZERO,
        )
        .unwrap();
    let started = Instant::now();
    while server_subjects()
        .await
        .iter()
        .any(|subject| subject.contains(&token))
    {
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "deletion did not reach the server"
        );
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires tools/mail-server/mail-server.sh and the test-ca feature"]
async fn moves_a_thread_out_of_the_trash_and_back_to_the_inbox() {
    ensure_mailboxes().await;
    let directory =
        std::env::temp_dir().join(format!("openmailbox-greenmail-{}", uuid::Uuid::new_v4()));
    let engine = Engine::open(&directory, tokio::runtime::Handle::current()).unwrap();
    engine.set_event_sink(Arc::new(|_| {}));
    engine.on_foreground();
    let account = engine
        .add_account(
            AccountConfig {
                email: "bob@example.com".into(),
                display_name: "Bob".into(),
                username: "bob@example.com".into(),
                imap: endpoint(3993),
                smtp: endpoint(3465),
            },
            "secret".into(),
        )
        .await
        .unwrap();
    let token = uuid::Uuid::new_v4().simple().to_string();
    engine
        .send(draft(&account.id, format!("Restore {token}"), "Body", None))
        .unwrap();
    let thread = eventually(&engine, || thread_with(&engine, &token)).await;
    tokio::time::sleep(Duration::from_secs(4)).await;

    let relocation = engine
        .move_thread(
            thread.mailbox_id,
            thread.thread_id,
            Destination::Trash,
            Duration::ZERO,
        )
        .unwrap();
    let trash = relocation
        .target_mailbox_id
        .expect("bob has a Trash folder");
    wait_on_server("Trash", &token, true).await;
    engine.open_mailbox(trash).unwrap();
    tokio::time::sleep(Duration::from_secs(4)).await;

    engine
        .move_thread(trash, thread.thread_id, Destination::Inbox, Duration::ZERO)
        .unwrap();
    wait_on_server("INBOX", &token, true).await;
    wait_on_server("Trash", &token, false).await;

    let junk = engine
        .move_thread(
            thread.mailbox_id,
            thread.thread_id,
            Destination::Junk,
            Duration::ZERO,
        )
        .unwrap()
        .target_mailbox_id
        .expect("bob has a Junk folder");
    wait_on_server("Junk", &token, true).await;
    engine.open_mailbox(junk).unwrap();
    tokio::time::sleep(Duration::from_secs(4)).await;
    engine
        .move_thread(junk, thread.thread_id, Destination::Inbox, Duration::ZERO)
        .unwrap();
    wait_on_server("INBOX", &token, true).await;
    wait_on_server("Junk", &token, false).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires tools/mail-server/mail-server.sh and the test-ca feature"]
async fn sends_an_attachment_that_arrives_intact() {
    ensure_mailboxes().await;
    let directory =
        std::env::temp_dir().join(format!("openmailbox-greenmail-{}", uuid::Uuid::new_v4()));
    let engine = Engine::open(&directory, tokio::runtime::Handle::current()).unwrap();
    engine.set_event_sink(Arc::new(|_| {}));
    engine.on_foreground();
    let account = engine
        .add_account(
            AccountConfig {
                email: "bob@example.com".into(),
                display_name: "Bob".into(),
                username: "bob@example.com".into(),
                imap: endpoint(3993),
                smtp: endpoint(3465),
            },
            "secret".into(),
        )
        .await
        .unwrap();
    let file = directory.join("relevé.pdf");
    let content: Vec<u8> = (0..300_000u32).map(|index| (index % 251) as u8).collect();
    std::fs::write(&file, &content).unwrap();
    let token = uuid::Uuid::new_v4().simple().to_string();
    let mut message = draft(
        &account.id,
        format!("Attachment {token}"),
        "Ci-joint.",
        None,
    );
    message.attachments = vec![OutgoingAttachment {
        path: file.to_string_lossy().into_owned(),
        filename: "relevé.pdf".into(),
        mime_type: "application/pdf".into(),
    }];
    engine.send(message).unwrap();

    let thread = eventually(&engine, || thread_with(&engine, &token)).await;
    assert!(thread.has_attachment);
    let body = engine.body(thread.latest.id).await.unwrap();
    assert_eq!(body.attachments.len(), 1);
    assert_eq!(body.attachments[0].filename, "relevé.pdf");
    assert_eq!(body.attachments[0].size, content.len() as u64);
    let saved = engine
        .save_attachment(
            thread.latest.id,
            body.attachments[0].index,
            directory.join("saved"),
        )
        .await
        .unwrap();
    assert_eq!(std::fs::read(saved).unwrap(), content);
}
