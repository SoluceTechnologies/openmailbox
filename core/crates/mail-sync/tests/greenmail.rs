use std::sync::Arc;
use std::time::{Duration, Instant};

use mail_model::{
    AccountConfig, Address, Draft, Keyword, MailboxRole, Security, ServerEndpoint, ThreadScope,
    ThreadSummary,
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
    }
}

async fn server_subjects() -> Vec<String> {
    let mut connection = proto_imap::connect(&endpoint(3993), "bob@example.com", "secret")
        .await
        .unwrap();
    connection.select("INBOX").await.unwrap();
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

async fn ensure_sent_mailbox() {
    let mut connection = proto_imap::connect(&endpoint(3993), "bob@example.com", "secret")
        .await
        .unwrap();
    let mailboxes = connection.list_mailboxes().await.unwrap();
    if !mailboxes
        .iter()
        .any(|mailbox| mailbox.role == Some(MailboxRole::Sent))
    {
        connection.create_mailbox("Sent").await.unwrap();
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
    ensure_sent_mailbox().await;
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
        .move_thread(thread.mailbox_id, thread.thread_id, Destination::Trash)
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
        .move_thread(thread.mailbox_id, thread.thread_id, Destination::Trash)
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
