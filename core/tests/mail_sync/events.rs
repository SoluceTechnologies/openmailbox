use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use mail_model::SyncStatus;

use super::*;

#[test]
fn coalesce_keeps_the_latest_secret_of_each_account() {
    let changed = |account_id: &str, secret: &str| CoreEvent::SecretChanged {
        account_id: account_id.into(),
        secret: secret.into(),
    };
    assert_eq!(
        coalesce(vec![
            changed("a", "1"),
            changed("b", "1"),
            changed("a", "2")
        ]),
        vec![changed("b", "1"), changed("a", "2")]
    );
}

#[test]
fn coalesce_merges_mailbox_changes_and_keeps_the_latest_sync_state() {
    let syncing = |status| CoreEvent::SyncState {
        account_id: "a".into(),
        status,
    };
    let merged = coalesce(vec![
        CoreEvent::MailboxesChanged {
            mailbox_ids: vec![2],
        },
        syncing(SyncStatus::Syncing),
        CoreEvent::AccountsChanged,
        CoreEvent::MailboxesChanged {
            mailbox_ids: vec![1, 2],
        },
        syncing(SyncStatus::Idle {
            last_synced_at: Some(5),
        }),
        CoreEvent::AccountsChanged,
    ]);
    assert_eq!(
        merged,
        vec![
            CoreEvent::MailboxesChanged {
                mailbox_ids: vec![1, 2]
            },
            CoreEvent::AccountsChanged,
            syncing(SyncStatus::Idle {
                last_synced_at: Some(5)
            }),
        ]
    );
}

fn arrives(received: &Mutex<Vec<CoreEvent>>, expected: &CoreEvent) -> bool {
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        if received.lock().unwrap().contains(expected) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

#[test]
fn keeps_delivering_after_the_sink_panics() {
    let events = Events::start();
    let received = Arc::new(Mutex::new(Vec::new()));
    let recorded = received.clone();
    events.set_sink(Arc::new(move |event| {
        if event == CoreEvent::AccountsChanged {
            panic!("listener failed");
        }
        recorded.lock().unwrap().push(event);
    }));
    events.emit(CoreEvent::AccountsChanged);
    std::thread::sleep(COALESCING_WINDOW * 3);
    events.mailboxes_changed([1]);
    assert!(arrives(
        &received,
        &CoreEvent::MailboxesChanged {
            mailbox_ids: vec![1]
        }
    ));
}

#[test]
fn a_new_sink_replaces_one_that_never_returns() {
    let events = Events::start();
    let (_release, blocked) = mpsc::channel::<()>();
    let blocked = Mutex::new(blocked);
    events.set_sink(Arc::new(move |_| {
        let _ = blocked.lock().unwrap().recv();
    }));
    events.emit(CoreEvent::AccountsChanged);
    std::thread::sleep(COALESCING_WINDOW * 3);
    let received = Arc::new(Mutex::new(Vec::new()));
    let recorded = received.clone();
    events.set_sink(Arc::new(move |event| recorded.lock().unwrap().push(event)));
    events.emit(CoreEvent::AccountsChanged);
    assert!(arrives(&received, &CoreEvent::AccountsChanged));
}
