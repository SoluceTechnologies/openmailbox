use std::collections::BTreeSet;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use mail_model::CoreEvent;

const COALESCING_WINDOW: Duration = Duration::from_millis(60);

pub type EventSink = Arc<dyn Fn(CoreEvent) + Send + Sync>;

#[derive(Clone, Default)]
pub struct Events {
    sender: Arc<RwLock<Option<Sender<CoreEvent>>>>,
}

impl Events {
    pub fn start() -> Events {
        Events::default()
    }

    pub fn emit(&self, event: CoreEvent) {
        if let Some(sender) = self
            .sender
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
        {
            let _ = sender.send(event);
        }
    }

    pub fn mailboxes_changed(&self, mailbox_ids: impl IntoIterator<Item = i64>) {
        self.emit(CoreEvent::MailboxesChanged {
            mailbox_ids: mailbox_ids.into_iter().collect(),
        });
    }

    pub fn set_sink(&self, sink: EventSink) {
        let (sender, receiver) = channel();
        std::thread::Builder::new()
            .name("mail-events".into())
            .spawn(move || dispatch(receiver, sink))
            .expect("event dispatcher thread starts");
        *self
            .sender
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(sender);
    }
}

fn dispatch(receiver: Receiver<CoreEvent>, sink: EventSink) {
    while let Ok(first) = receiver.recv() {
        let mut batch = vec![first];
        let deadline = Instant::now() + COALESCING_WINDOW;
        while let Ok(event) =
            receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            batch.push(event);
        }
        for event in coalesce(batch) {
            let _ = catch_unwind(AssertUnwindSafe(|| sink(event)));
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
            CoreEvent::SecretChanged { ref account_id, .. } => {
                others.retain(|existing| !matches!(existing, CoreEvent::SecretChanged { account_id: other, .. } if other == account_id));
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
#[path = "../../../tests/mail_sync/events.rs"]
mod tests;
