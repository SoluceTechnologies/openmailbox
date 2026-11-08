use std::collections::BTreeSet;
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use mail_model::CoreEvent;

const COALESCING_WINDOW: Duration = Duration::from_millis(60);

pub type EventSink = Arc<dyn Fn(CoreEvent) + Send + Sync>;

#[derive(Clone)]
pub struct Events {
    sender: Sender<CoreEvent>,
    sink: Arc<RwLock<Option<EventSink>>>,
}

impl Events {
    pub fn start() -> Events {
        let (sender, receiver) = channel();
        let sink: Arc<RwLock<Option<EventSink>>> = Arc::default();
        let dispatcher_sink = sink.clone();
        std::thread::Builder::new()
            .name("mail-events".into())
            .spawn(move || dispatch(receiver, dispatcher_sink))
            .expect("event dispatcher thread starts");
        Events { sender, sink }
    }

    pub fn emit(&self, event: CoreEvent) {
        let _ = self.sender.send(event);
    }

    pub fn mailboxes_changed(&self, mailbox_ids: impl IntoIterator<Item = i64>) {
        self.emit(CoreEvent::MailboxesChanged {
            mailbox_ids: mailbox_ids.into_iter().collect(),
        });
    }

    pub fn set_sink(&self, sink: EventSink) {
        *self
            .sink
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(sink);
    }
}

fn dispatch(receiver: Receiver<CoreEvent>, sink: Arc<RwLock<Option<EventSink>>>) {
    while let Ok(first) = receiver.recv() {
        let mut batch = vec![first];
        let deadline = Instant::now() + COALESCING_WINDOW;
        while let Ok(event) =
            receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            batch.push(event);
        }
        let current_sink = sink
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        if let Some(current_sink) = current_sink {
            for event in coalesce(batch) {
                current_sink(event);
            }
        }
    }
}

fn coalesce(batch: Vec<CoreEvent>) -> Vec<CoreEvent> {
    let mut mailbox_ids = BTreeSet::new();
    let mut has_mailbox_event = false;
    let mut others: Vec<CoreEvent> = Vec::new();
    for event in batch {
        match event {
            CoreEvent::MailboxesChanged { mailbox_ids: ids } => {
                has_mailbox_event = true;
                mailbox_ids.extend(ids);
            }
            CoreEvent::SyncState { ref account_id, .. } => {
                others.retain(|existing| !matches!(existing, CoreEvent::SyncState { account_id: other, .. } if other == account_id));
                others.push(event);
            }
            event if others.contains(&event) => {}
            event => others.push(event),
        }
    }
    if has_mailbox_event {
        others.insert(
            0,
            CoreEvent::MailboxesChanged {
                mailbox_ids: mailbox_ids.into_iter().collect(),
            },
        );
    }
    others
}

#[cfg(test)]
mod tests {
    use mail_model::SyncStatus;

    use super::*;

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
}
