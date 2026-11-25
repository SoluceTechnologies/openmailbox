use mail_model::{Address, FetchedMessage, Flags, MailboxRole, ParsedHeaders, RemoteMailbox};

use super::*;
use crate::test_support::{account, store};

fn waiting(store: &Store, kind: &str) -> Vec<Operation> {
    store
        .waiting_operations("alice", kind)
        .unwrap()
        .into_iter()
        .map(|operation| serde_json::from_str(&operation.payload).unwrap())
        .collect()
}

#[test]
fn uids_that_waiting_moves_and_deletes_took_out_are_held() {
    let store = store();
    store.insert_account(&account("alice")).unwrap();
    let source = |mailbox_id, uid| Source {
        email_id: 1,
        mailbox_id,
        uid,
    };
    enqueue(
        &store,
        "alice",
        &Operation::Move {
            sources: vec![source(1, Some(7)), source(2, Some(8)), source(1, None)],
            target_mailbox_id: 3,
        },
    )
    .unwrap();
    enqueue(
        &store,
        "alice",
        &Operation::Delete {
            sources: vec![source(1, Some(9))],
        },
    )
    .unwrap();

    assert_eq!(
        held_uids(&store, "alice", 1).unwrap(),
        std::collections::HashSet::from([7, 9])
    );
}

#[test]
fn moving_a_message_twice_sends_one_operation_from_its_server_location() {
    let store = store();
    store.insert_account(&account("alice")).unwrap();
    let remote = |name: &str, role| RemoteMailbox {
        remote_name: name.into(),
        name: name.into(),
        depth: 0,
        role: Some(role),
        selectable: true,
    };
    store
        .replace_mailboxes(
            "alice",
            &[
                remote("INBOX", MailboxRole::Inbox),
                remote("Archive", MailboxRole::Archive),
                remote("Trash", MailboxRole::Trash),
            ],
        )
        .unwrap();
    let id = |role| store.mailbox_by_role("alice", role).unwrap().unwrap().id;
    let (inbox, archive, trash) = (
        id(MailboxRole::Inbox),
        id(MailboxRole::Archive),
        id(MailboxRole::Trash),
    );
    let headers = ParsedHeaders {
        message_id: Some("m@x".into()),
        from: vec![Address {
            name: None,
            email: "bob@x.org".into(),
        }],
        ..ParsedHeaders::default()
    };
    store
        .insert_messages(
            "alice",
            inbox,
            &[FetchedMessage {
                uid: 7,
                flags: Flags::default(),
                internal_date: Some(1),
                size: 1,
                headers,
            }],
        )
        .unwrap();
    let email_id = store
        .thread_email_ids(
            inbox,
            store
                .list_threads(
                    mail_model::ThreadScope::Mailbox(inbox),
                    &mail_model::ThreadFilter::default(),
                    None,
                    None,
                    1,
                )
                .unwrap()
                .threads[0]
                .thread_id,
        )
        .unwrap()[0];

    let first = store
        .move_emails(&[email_id], inbox, Some(archive))
        .unwrap();
    enqueue_relocation(&store, "alice", first, Some(archive), 0).unwrap();
    let second = store
        .move_emails(&[email_id], archive, Some(trash))
        .unwrap();
    enqueue_relocation(&store, "alice", second, Some(trash), 0).unwrap();

    assert_eq!(
        waiting(&store, "move"),
        vec![Operation::Move {
            sources: vec![Source {
                email_id,
                mailbox_id: inbox,
                uid: Some(7)
            }],
            target_mailbox_id: trash
        }]
    );
}

#[test]
fn a_message_moved_again_after_the_server_took_the_first_move_is_still_moved() {
    let store = store();
    store.insert_account(&account("alice")).unwrap();
    let remote = |name: &str, role| RemoteMailbox {
        remote_name: name.into(),
        name: name.into(),
        depth: 0,
        role: Some(role),
        selectable: true,
    };
    store
        .replace_mailboxes(
            "alice",
            &[
                remote("INBOX", MailboxRole::Inbox),
                remote("Archive", MailboxRole::Archive),
                remote("Trash", MailboxRole::Trash),
            ],
        )
        .unwrap();
    let id = |role| store.mailbox_by_role("alice", role).unwrap().unwrap().id;
    let (inbox, archive, trash) = (
        id(MailboxRole::Inbox),
        id(MailboxRole::Archive),
        id(MailboxRole::Trash),
    );
    store
        .insert_messages(
            "alice",
            inbox,
            &[FetchedMessage {
                uid: 7,
                flags: Flags::default(),
                internal_date: Some(1),
                size: 1,
                headers: ParsedHeaders {
                    message_id: Some("m@x".into()),
                    ..ParsedHeaders::default()
                },
            }],
        )
        .unwrap();
    let thread_id = store
        .list_threads(
            mail_model::ThreadScope::Mailbox(inbox),
            &mail_model::ThreadFilter::default(),
            None,
            None,
            1,
        )
        .unwrap()
        .threads[0]
        .thread_id;
    let email_id = store.thread_email_ids(inbox, thread_id).unwrap()[0];
    let first = store
        .move_emails(&[email_id], inbox, Some(archive))
        .unwrap();
    enqueue_relocation(&store, "alice", first, Some(archive), 0).unwrap();
    for operation in store.waiting_operations("alice", "move").unwrap() {
        store.complete_operation(operation.id).unwrap();
    }

    let second = store
        .move_emails(&[email_id], archive, Some(trash))
        .unwrap();
    enqueue_relocation(&store, "alice", second, Some(trash), 0).unwrap();

    assert_eq!(
        waiting(&store, "move"),
        vec![Operation::Move {
            sources: vec![Source {
                email_id,
                mailbox_id: archive,
                uid: None
            }],
            target_mailbox_id: trash
        }]
    );
}

#[test]
fn keyword_changes_on_the_same_messages_merge() {
    let store = store();
    store.insert_account(&account("alice")).unwrap();
    enqueue_keywords(&store, "alice", vec![1], vec![Keyword::Seen], vec![]).unwrap();
    enqueue_keywords(
        &store,
        "alice",
        vec![1],
        vec![Keyword::Flagged],
        vec![Keyword::Seen],
    )
    .unwrap();
    assert_eq!(
        waiting(&store, "set_keywords"),
        vec![Operation::SetKeywords {
            email_ids: vec![1],
            add: vec![Keyword::Flagged],
            remove: vec![Keyword::Seen]
        }]
    );
}

#[test]
fn backoff_grows_to_fifteen_minutes() {
    assert_eq!(backoff_ms(0), 1_000);
    assert_eq!(backoff_ms(3), 8_000);
    assert_eq!(backoff_ms(30), 900_000);
}
