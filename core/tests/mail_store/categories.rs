use mail_model::{
    Address, FetchedMessage, Flags, MailboxRole, RemoteMailbox, SendingSignals, ThreadFilter,
    ThreadScope,
};

use super::*;
use crate::test_support;

const LIST: SendingSignals = SendingSignals {
    bulk: true,
    automated: false,
    marketing: false,
    one_click: false,
};

fn message(
    uid: u32,
    from: &str,
    subject: &str,
    signals: SendingSignals,
    references: &[&str],
) -> FetchedMessage {
    FetchedMessage {
        uid,
        flags: Flags::default(),
        internal_date: Some(1_000 + i64::from(uid)),
        size: 100,
        headers: ParsedHeaders {
            message_id: Some(format!("m{uid}@x")),
            references: references.iter().map(|value| value.to_string()).collect(),
            subject: Some(subject.into()),
            from: vec![Address {
                name: None,
                email: from.into(),
            }],
            signals,
            ..ParsedHeaders::default()
        },
    }
}

fn setup() -> (Store, std::path::PathBuf, i64) {
    let (store, directory) = test_support::store();
    store
        .insert_account(&test_support::account("alice"))
        .unwrap();
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
    let inbox = store
        .mailbox_by_role("alice", MailboxRole::Inbox)
        .unwrap()
        .unwrap()
        .id;
    (store, directory, inbox)
}

fn subjects(store: &Store, category: Option<Category>) -> Vec<String> {
    let mut subjects: Vec<String> = store
        .list_threads(
            ThreadScope::Unified,
            &ThreadFilter::default(),
            category,
            None,
            50,
        )
        .unwrap()
        .threads
        .into_iter()
        .map(|thread| thread.latest.subject.unwrap())
        .collect();
    subjects.sort();
    subjects
}

#[test]
fn messages_are_classified_when_stored_and_listed_by_category() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "bob@example.com",
                    "Lunch tomorrow?",
                    SendingSignals::default(),
                    &[],
                ),
                message(
                    2,
                    "no-reply@shop.example",
                    "Your order has shipped",
                    SendingSignals::default(),
                    &[],
                ),
                message(3, "editor@weekly.example", "This week in Rust", LIST, &[]),
                message(4, "deals@brand.example", "Black Friday: -40%", LIST, &[]),
            ],
        )
        .unwrap();
    assert_eq!(
        subjects(&store, Some(Category::Primary)),
        ["Lunch tomorrow?"]
    );
    assert_eq!(
        subjects(&store, Some(Category::Transactions)),
        ["Your order has shipped"]
    );
    assert_eq!(
        subjects(&store, Some(Category::Updates)),
        ["This week in Rust"]
    );
    assert_eq!(
        subjects(&store, Some(Category::Promotions)),
        ["Black Friday: -40%"]
    );
    assert_eq!(subjects(&store, None).len(), 4);
}

#[test]
fn a_personal_reply_lifts_its_thread_to_primary() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "editor@weekly.example", "This week in Rust", LIST, &[]),
                message(
                    2,
                    "bob@example.com",
                    "Re: This week in Rust",
                    SendingSignals::default(),
                    &["m1@x"],
                ),
            ],
        )
        .unwrap();
    let threads = store
        .list_threads(
            ThreadScope::Mailbox(inbox),
            &ThreadFilter::default(),
            None,
            None,
            50,
        )
        .unwrap()
        .threads;
    assert_eq!(threads.len(), 1);
    assert_eq!(threads[0].category, Category::Primary);
    assert_eq!(
        threads[0].latest.subject.as_deref(),
        Some("Re: This week in Rust")
    );
}

#[test]
fn programs_sending_in_the_users_name_are_not_primary() {
    let (store, _directory, inbox) = setup();
    let automated = SendingSignals {
        automated: true,
        ..SendingSignals::default()
    };
    let alice = Address {
        name: None,
        email: "alice@example.com".into(),
    };
    store.record_sent(&[alice], 500).unwrap();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "alice@example.com",
                    "Note to self",
                    SendingSignals::default(),
                    &[],
                ),
                message(
                    2,
                    "Alice@example.com",
                    "Your tokens will expire",
                    automated,
                    &[],
                ),
            ],
        )
        .unwrap();
    assert_eq!(subjects(&store, Some(Category::Primary)), ["Note to self"]);
    assert_eq!(
        subjects(&store, Some(Category::Updates)),
        ["Your tokens will expire"]
    );
}

#[test]
fn people_the_user_writes_to_stay_primary() {
    let (store, _directory, inbox) = setup();
    let editor = Address {
        name: None,
        email: "editor@weekly.example".into(),
    };
    store.record_sent(&[editor], 500).unwrap();
    store
        .insert_messages(
            "alice",
            inbox,
            &[message(1, "Editor@Weekly.example", "This week", LIST, &[])],
        )
        .unwrap();
    assert_eq!(subjects(&store, Some(Category::Primary)), ["This week"]);
}

#[test]
fn moving_a_sender_moves_its_past_and_future_mail() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[message(1, "editor@weekly.example", "Issue 1", LIST, &[])],
        )
        .unwrap();
    let changed = store
        .set_sender_category("Editor@weekly.example", Category::Primary)
        .unwrap();
    assert_eq!(changed, [inbox]);
    store
        .insert_messages(
            "alice",
            inbox,
            &[message(2, "editor@weekly.example", "Issue 2", LIST, &[])],
        )
        .unwrap();
    assert_eq!(
        subjects(&store, Some(Category::Primary)),
        ["Issue 1", "Issue 2"]
    );
    assert!(subjects(&store, Some(Category::Updates)).is_empty());
}

#[test]
fn only_primary_mail_is_notified() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "bob@example.com",
                    "Lunch tomorrow?",
                    SendingSignals::default(),
                    &[],
                ),
                message(2, "deals@brand.example", "Black Friday: -40%", LIST, &[]),
            ],
        )
        .unwrap();
    let notified: Vec<_> = store
        .unread_inbox_emails_after("alice", (0, 0))
        .unwrap()
        .into_iter()
        .map(|message| message.email.subject.unwrap())
        .collect();
    assert_eq!(notified, ["Lunch tomorrow?"]);
}

#[test]
fn older_inbox_mail_is_classified_again_from_its_headers() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "editor@weekly.example",
                    "This week",
                    SendingSignals::default(),
                    &[],
                ),
                message(
                    2,
                    "bob@example.com",
                    "Lunch",
                    SendingSignals::default(),
                    &[],
                ),
            ],
        )
        .unwrap();
    assert!(
        store
            .uids_with_unknown_signals(inbox, 50)
            .unwrap()
            .is_empty()
    );
    store
        .write(|transaction| {
            transaction
                .execute_batch("UPDATE email SET signals = NULL")
                .storage()
        })
        .unwrap();
    assert_eq!(store.uids_with_unknown_signals(inbox, 50).unwrap(), [2, 1]);
    let refetched = [message(1, "editor@weekly.example", "This week", LIST, &[])];
    assert!(
        store
            .reclassify("alice", inbox, &[2, 1], &refetched)
            .unwrap()
    );
    assert_eq!(subjects(&store, Some(Category::Updates)), ["This week"]);
    assert_eq!(subjects(&store, Some(Category::Primary)), ["Lunch"]);
    assert!(
        store
            .uids_with_unknown_signals(inbox, 50)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn stored_alias_mail_gets_its_original_sender_from_headers_fetched_again() {
    let (store, directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "reply+qwerty@simplelogin.co",
                    "Receipt",
                    SendingSignals::default(),
                    &[],
                ),
                message(
                    2,
                    "shop+hello=store.example@johndoe.addy.io",
                    "Order",
                    SendingSignals::default(),
                    &[],
                ),
                message(
                    3,
                    "bob@example.com",
                    "Lunch",
                    SendingSignals::default(),
                    &[],
                ),
            ],
        )
        .unwrap();
    drop(store);
    let path = directory.join("mail.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(crate::MIGRATIONS[13])
        .unwrap();
    let store = Store::open(&path).unwrap();
    assert_eq!(store.uids_with_unknown_signals(inbox, 50).unwrap(), [2, 1]);
    let mut refetched = message(
        1,
        "reply+qwerty@simplelogin.co",
        "Receipt",
        SendingSignals::default(),
        &[],
    );
    refetched.headers.original_sender = Some("noreply@github.com".into());
    assert!(
        store
            .reclassify("alice", inbox, &[2, 1], &[refetched])
            .unwrap()
    );
    let senders: Vec<Option<String>> = Connection::open(&path)
        .unwrap()
        .prepare("SELECT original_sender FROM email ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(senders, [Some("noreply@github.com".into()), None, None]);
    assert!(
        store
            .uids_with_unknown_signals(inbox, 50)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn new_rules_classify_stored_mail_again_without_its_headers() {
    let (store, directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[message(1, "editor@weekly.example", "This week", LIST, &[])],
        )
        .unwrap();
    drop(store);
    let path = directory.join("mail.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(
            "UPDATE email SET category = 3;
                 UPDATE mailbox_thread SET category = 3;
                 UPDATE store_setting SET value = value - 1 WHERE key = 'classifier'",
        )
        .unwrap();
    let store = Store::open(&path).unwrap();
    assert_eq!(subjects(&store, Some(Category::Updates)), ["This week"]);
    assert!(subjects(&store, Some(Category::Promotions)).is_empty());
    assert!(
        store
            .uids_with_unknown_signals(inbox, 50)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn colleagues_newsletters_are_primary_but_not_their_programs() {
    let (store, _directory, inbox) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(
                    1,
                    "contact@example.com",
                    "Découvrez notre nouvelle offre",
                    LIST,
                    &[],
                ),
                message(2, "noreply@example.com", "Your build failed", LIST, &[]),
            ],
        )
        .unwrap();
    assert_eq!(
        subjects(&store, Some(Category::Primary)),
        ["Découvrez notre nouvelle offre"]
    );
    assert_eq!(
        subjects(&store, Some(Category::Updates)),
        ["Your build failed"]
    );
}

#[test]
fn mail_stored_before_categories_is_classified_from_its_sender() {
    let directory = std::env::temp_dir().join(format!(
        "mail-store-categories-{}-{}",
        std::process::id(),
        mail_model::now_millis()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let connection = Connection::open(&path).unwrap();
    crate::migrate_with(&connection, &crate::MIGRATIONS[..5]).unwrap();
    connection
            .execute_batch(
                r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port,
                     imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
                   VALUES ('alice', 'alice@example.com', 'Alice', 'alice', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                 INSERT INTO mailbox (id, account_id, remote_name, name, role) VALUES (1, 'alice', 'INBOX', 'INBOX', 'inbox');
                 INSERT INTO thread (id, account_id, root) VALUES (1, 'alice', 'm1@x');
                 INSERT INTO email (id, account_id, thread_id, message_id, subject, from_json, to_json, cc_json,
                     reply_to_json, received_at)
                   VALUES (1, 'alice', 1, 'm1@x', 'Weekly digest',
                     '[{"name":null,"email":"NoReply@service.example"}]', '[]', '[]', '[]', 1000);
                 INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (1, 1, 1);
                 INSERT INTO mailbox_thread (mailbox_id, thread_id, account_id, unified, latest_email_id,
                     last_received_at, message_count, unread_count, is_flagged, has_attachment)
                   VALUES (1, 1, 'alice', 1, 1, 1000, 1, 1, 0, 0);"#,
            )
            .unwrap();
    drop(connection);
    let store = Store::open(&path).unwrap();
    assert_eq!(subjects(&store, Some(Category::Updates)), ["Weekly digest"]);
    assert!(subjects(&store, Some(Category::Primary)).is_empty());
}
