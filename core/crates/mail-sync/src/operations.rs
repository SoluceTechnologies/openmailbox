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
#[path = "../../../tests/mail_sync/operations.rs"]
mod tests;
