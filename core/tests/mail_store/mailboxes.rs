use super::*;
use crate::test_support;

fn remote(name: &str, role: Option<MailboxRole>) -> RemoteMailbox {
    RemoteMailbox {
        remote_name: name.into(),
        name: name.into(),
        depth: 0,
        role,
        selectable: true,
    }
}

fn nested(remote_name: &str, depth: u32, role: Option<MailboxRole>) -> RemoteMailbox {
    RemoteMailbox {
        remote_name: remote_name.into(),
        name: remote_name.rsplit(['.', '/']).next().unwrap().into(),
        depth,
        role,
        selectable: true,
    }
}

#[test]
fn list_mailboxes_gives_each_subfolder_its_parent() {
    let (store, _directory) = test_support::store();
    store
        .insert_account(&test_support::account("alice"))
        .unwrap();
    store
        .replace_mailboxes(
            "alice",
            &[
                nested("INBOX", 0, Some(MailboxRole::Inbox)),
                nested("INBOX.Sent", 1, Some(MailboxRole::Sent)),
                nested("INBOX.Spam", 1, None),
                nested("INBOX.Spam.Junk", 2, Some(MailboxRole::Junk)),
                nested("INBOX.Sentinel", 1, None),
                nested("Projects", 0, None),
                nested("Projects/2026", 1, None),
                nested("Pro/Orphan", 1, None),
            ],
        )
        .unwrap();

    let mailboxes = store.list_mailboxes(Some("alice")).unwrap();
    let id_of = |name: &str| {
        mailboxes
            .iter()
            .find(|mailbox| mailbox.remote_name == name)
            .unwrap()
            .id
    };
    let parent_of = |name: &str| {
        mailboxes
            .iter()
            .find(|mailbox| mailbox.remote_name == name)
            .unwrap()
            .parent_id
    };
    assert_eq!(parent_of("INBOX"), None);
    assert_eq!(parent_of("INBOX.Sent"), Some(id_of("INBOX")));
    assert_eq!(parent_of("INBOX.Spam.Junk"), Some(id_of("INBOX.Spam")));
    assert_eq!(parent_of("INBOX.Sentinel"), Some(id_of("INBOX")));
    assert_eq!(parent_of("Projects/2026"), Some(id_of("Projects")));
    assert_eq!(parent_of("Pro/Orphan"), None);
}

#[test]
fn replace_mailboxes_keeps_ids_and_removes_missing_ones() {
    let (store, _directory) = test_support::store();
    store
        .insert_account(&test_support::account("alice"))
        .unwrap();
    store
        .replace_mailboxes(
            "alice",
            &[
                remote("INBOX", Some(MailboxRole::Inbox)),
                remote("Old", None),
            ],
        )
        .unwrap();
    let inbox_id = store
        .mailbox_by_role("alice", MailboxRole::Inbox)
        .unwrap()
        .unwrap()
        .id;

    store
        .replace_mailboxes(
            "alice",
            &[
                remote("INBOX", Some(MailboxRole::Inbox)),
                remote("Sent", Some(MailboxRole::Sent)),
            ],
        )
        .unwrap();

    let names: Vec<String> = store
        .list_mailboxes(Some("alice"))
        .unwrap()
        .into_iter()
        .map(|mailbox| mailbox.name)
        .collect();
    assert_eq!(names, vec!["INBOX", "Sent"]);
    assert_eq!(
        store
            .mailbox_by_role("alice", MailboxRole::Inbox)
            .unwrap()
            .unwrap()
            .id,
        inbox_id
    );
}

#[test]
fn replace_mailboxes_refuses_a_list_without_inbox() {
    let (store, _directory) = test_support::store();
    store
        .insert_account(&test_support::account("alice"))
        .unwrap();
    let listed = [
        remote("INBOX", Some(MailboxRole::Inbox)),
        remote("Sent", Some(MailboxRole::Sent)),
    ];
    store.replace_mailboxes("alice", &listed).unwrap();

    assert!(matches!(
        store.replace_mailboxes("alice", &[]),
        Err(Error::Server(_))
    ));

    assert_eq!(store.list_mailboxes(Some("alice")).unwrap().len(), 2);
}
