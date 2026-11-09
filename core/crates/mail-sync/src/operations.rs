use std::collections::{HashMap, HashSet};

use mail_model::{Keyword, Result};
use mail_store::{MessageLocation, OperationRewrite, Store};
use serde::{Deserialize, Serialize};

const BASE_BACKOFF_MS: i64 = 1_000;
const MAX_BACKOFF_MS: i64 = 15 * 60 * 1_000;
pub const MAX_ATTEMPTS: u32 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Source {
    pub email_id: i64,
    pub mailbox_id: i64,
    pub uid: Option<u32>,
}

impl From<MessageLocation> for Source {
    fn from(location: MessageLocation) -> Source {
        Source {
            email_id: location.email_id,
            mailbox_id: location.mailbox_id,
            uid: location.uid,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Operation {
    SetKeywords {
        email_ids: Vec<i64>,
        add: Vec<Keyword>,
        remove: Vec<Keyword>,
    },
    Move {
        sources: Vec<Source>,
        target_mailbox_id: i64,
    },
    Delete {
        sources: Vec<Source>,
    },
    Send {
        raw: String,
        envelope_from: String,
        recipients: Vec<String>,
    },
    AppendSent {
        raw: String,
    },
}

impl Operation {
    pub fn kind(&self) -> &'static str {
        match self {
            Operation::SetKeywords { .. } => "set_keywords",
            Operation::Move { .. } => "move",
            Operation::Delete { .. } => "delete",
            Operation::Send { .. } => "send",
            Operation::AppendSent { .. } => "append_sent",
        }
    }
}

pub fn backoff_ms(attempts: u32) -> i64 {
    BASE_BACKOFF_MS
        .saturating_mul(1_i64 << attempts.min(20))
        .min(MAX_BACKOFF_MS)
}

pub fn enqueue_keywords(
    store: &Store,
    account_id: &str,
    email_ids: Vec<i64>,
    add: Vec<Keyword>,
    remove: Vec<Keyword>,
) -> Result<()> {
    let mut rewrites = Vec::new();
    let (mut add, mut remove) = (add, remove);
    for waiting in store.waiting_operations(account_id, "set_keywords")? {
        let Ok(Operation::SetKeywords {
            email_ids: previous_ids,
            add: previous_add,
            remove: previous_remove,
        }) = serde_json::from_str(&waiting.payload)
        else {
            continue;
        };
        if previous_ids != email_ids {
            continue;
        }
        let inherited_add: Vec<Keyword> = previous_add
            .into_iter()
            .filter(|keyword| !remove.contains(keyword) && !add.contains(keyword))
            .collect();
        let inherited_remove: Vec<Keyword> = previous_remove
            .into_iter()
            .filter(|keyword| !add.contains(keyword) && !remove.contains(keyword))
            .collect();
        add.extend(inherited_add);
        remove.extend(inherited_remove);
        rewrites.push(OperationRewrite::Remove { id: waiting.id });
    }
    let operation = Operation::SetKeywords {
        email_ids,
        add,
        remove,
    };
    store.enqueue_operation(
        account_id,
        operation.kind(),
        &serialize(&operation),
        &rewrites,
        0,
    )?;
    Ok(())
}

/// A message moved locally has no UID in its new mailbox until the server confirms the move.
/// Moving it again must act on the location still known to the server, which lives in the
/// pending `Move` operation: that operation gives up the message and the new one takes it over.
/// When the first move already reached the server, the source keeps no UID and the worker finds
/// the message by its Message-ID when the operation runs.
pub fn enqueue_relocation(
    store: &Store,
    account_id: &str,
    sources: Vec<MessageLocation>,
    target_mailbox_id: Option<i64>,
    not_before: i64,
) -> Result<()> {
    let mut sources: Vec<Source> = sources.into_iter().map(Source::from).collect();
    let unresolved: HashMap<i64, i64> = sources
        .iter()
        .filter(|source| source.uid.is_none())
        .map(|source| (source.email_id, source.mailbox_id))
        .collect();
    let mut rewrites = Vec::new();
    if !unresolved.is_empty() {
        for waiting in store.waiting_operations(account_id, "move")? {
            let Ok(Operation::Move {
                sources: waiting_sources,
                target_mailbox_id: waiting_target,
            }) = serde_json::from_str(&waiting.payload)
            else {
                continue;
            };
            let (taken, kept): (Vec<Source>, Vec<Source>) = waiting_sources
                .into_iter()
                .partition(|source| unresolved.get(&source.email_id) == Some(&waiting_target));
            if taken.is_empty() {
                continue;
            }
            sources.retain(|source| {
                !taken
                    .iter()
                    .any(|stolen| stolen.email_id == source.email_id)
            });
            sources.extend(
                taken
                    .into_iter()
                    .filter(|stolen| Some(stolen.mailbox_id) != target_mailbox_id),
            );
            rewrites.push(if kept.is_empty() {
                OperationRewrite::Remove { id: waiting.id }
            } else {
                OperationRewrite::Replace {
                    id: waiting.id,
                    payload: serialize(&Operation::Move {
                        sources: kept,
                        target_mailbox_id: waiting_target,
                    }),
                }
            });
        }
    }
    if sources.is_empty() && rewrites.is_empty() {
        return Ok(());
    }
    let operation = match target_mailbox_id {
        Some(target_mailbox_id) => Operation::Move {
            sources,
            target_mailbox_id,
        },
        None => Operation::Delete { sources },
    };
    store.enqueue_operation(
        account_id,
        operation.kind(),
        &serialize(&operation),
        &rewrites,
        not_before,
    )?;
    Ok(())
}

/// UIDs of `mailbox_id` that a waiting move or delete already took out locally: a sync during the
/// undo hold must not bring them back.
pub fn held_uids(store: &Store, account_id: &str, mailbox_id: i64) -> Result<HashSet<u32>> {
    let mut held = HashSet::new();
    for kind in ["move", "delete"] {
        for waiting in store.waiting_operations(account_id, kind)? {
            if let Ok(Operation::Move { sources, .. } | Operation::Delete { sources }) =
                serde_json::from_str(&waiting.payload)
            {
                held.extend(
                    sources
                        .iter()
                        .filter(|source| source.mailbox_id == mailbox_id)
                        .filter_map(|source| source.uid),
                );
            }
        }
    }
    Ok(held)
}

pub fn enqueue(store: &Store, account_id: &str, operation: &Operation) -> Result<()> {
    store.enqueue_operation(account_id, operation.kind(), &serialize(operation), &[], 0)?;
    Ok(())
}

fn serialize(operation: &Operation) -> String {
    serde_json::to_string(operation).expect("operations serialize to JSON")
}

#[cfg(test)]
mod tests {
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
                    .list_threads(mail_model::ThreadScope::Mailbox(inbox), false, None, 1)
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
            .list_threads(mail_model::ThreadScope::Mailbox(inbox), false, None, 1)
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
}
