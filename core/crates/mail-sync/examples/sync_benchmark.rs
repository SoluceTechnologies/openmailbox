//! End-to-end sync benchmark against the local mail server.
//!
//! tools/mail-server/mail-server.sh start        (SMTP, used to validate the account)
//! tools/mail-server/mail-server.sh performance  (Dovecot IMAP on port 3994, 10,000 messages)
//! OPENMAILBOX_TEST_CA="$(cat tools/mail-server/.certificates/ca.pem)" \
//!   cargo run --release -p mail-sync --features test-ca --example sync_benchmark [imap port]

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use mail_model::{AccountConfig, CoreEvent, Security, ServerEndpoint, SyncStatus, ThreadScope};
use mail_sync::Engine;

fn endpoint(port: u16) -> ServerEndpoint {
    ServerEndpoint {
        host: "localhost".into(),
        port,
        security: Security::Tls,
    }
}

async fn wait_for_idle(events: &Arc<Mutex<Vec<(Instant, CoreEvent)>>>, after: Instant) -> Instant {
    loop {
        if let Some((at, _)) = events.lock().unwrap().iter().find(|(at, event)| {
            *at > after
                && matches!(
                    event,
                    CoreEvent::SyncState {
                        status: SyncStatus::Idle { .. },
                        ..
                    }
                )
        }) {
            return *at;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

fn milliseconds(duration: Duration) -> String {
    format!("{:.0} ms", duration.as_secs_f64() * 1e3)
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let directory =
        std::env::temp_dir().join(format!("openmailbox-sync-benchmark-{}", std::process::id()));
    let engine = Engine::open(&directory, tokio::runtime::Handle::current()).unwrap();
    let events: Arc<Mutex<Vec<(Instant, CoreEvent)>>> = Arc::default();
    let sink = events.clone();
    engine.set_event_sink(Arc::new(move |event| {
        sink.lock().unwrap().push((Instant::now(), event))
    }));

    let started = Instant::now();
    engine
        .add_account(
            AccountConfig {
                email: "alice@example.com".into(),
                display_name: "Alice".into(),
                username: "alice@example.com".into(),
                imap: endpoint(
                    std::env::args()
                        .nth(1)
                        .and_then(|port| port.parse().ok())
                        .unwrap_or(3994),
                ),
                smtp: endpoint(3465),
            },
            "secret".into(),
        )
        .await
        .unwrap();
    let account_added = started.elapsed();

    let first_page = loop {
        if !engine
            .list_threads(ThreadScope::Unified, false, None, None, 50)
            .unwrap()
            .threads
            .is_empty()
        {
            break started.elapsed();
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    };
    let initial_sync = wait_for_idle(&events, started).await - started;

    let mailboxes = engine.list_mailboxes(None).unwrap();
    let inbox = mailboxes
        .iter()
        .find(|mailbox| mailbox.role == Some(mail_model::MailboxRole::Inbox))
        .unwrap();
    let mut threads = 0;
    let mut cursor = None;
    loop {
        let page = engine
            .list_threads(ThreadScope::Unified, false, None, cursor.as_deref(), 500)
            .unwrap();
        threads += page.threads.len();
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }

    let refresh_started = Instant::now();
    engine.sync_now(None);
    let refresh = wait_for_idle(&events, refresh_started).await - refresh_started;

    let page = engine
        .list_threads(ThreadScope::Unified, false, None, None, 50)
        .unwrap()
        .threads;
    let mut cold = Vec::new();
    let mut warm = Vec::new();
    for thread in page.iter().take(20) {
        let started = Instant::now();
        engine.body(thread.latest.id).await.unwrap();
        cold.push(started.elapsed());
        let started = Instant::now();
        engine.body(thread.latest.id).await.unwrap();
        warm.push(started.elapsed());
    }
    cold.sort();
    warm.sort();

    let list_started = Instant::now();
    for _ in 0..100 {
        std::hint::black_box(
            engine
                .list_threads(ThreadScope::Unified, false, None, None, 50)
                .unwrap(),
        );
    }
    let list = list_started.elapsed() / 100;

    println!(
        "\nInbox of {} messages ({threads} threads)\n",
        inbox.total_count
    );
    println!("| Step | Duration |");
    println!("|------|----------|");
    println!(
        "| Add account (IMAP and SMTP sign-in) | {} |",
        milliseconds(account_added)
    );
    println!(
        "| First page of threads available | {} |",
        milliseconds(first_page)
    );
    println!("| Initial sync complete | {} |", milliseconds(initial_sync));
    println!(
        "| Manual refresh without changes | {} |",
        milliseconds(refresh)
    );
    println!(
        "| Open a message, body not cached (p50) | {:.2} ms |",
        cold[cold.len() / 2].as_secs_f64() * 1e3
    );
    println!(
        "| Open a message, body cached (p50) | {:.2} ms |",
        warm[warm.len() / 2].as_secs_f64() * 1e3
    );
    println!(
        "| Unified inbox first page | {:.2} ms |",
        list.as_secs_f64() * 1e3
    );
    std::fs::remove_dir_all(&directory).ok();
}
