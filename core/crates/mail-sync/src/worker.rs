use std::collections::{BTreeMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use mail_model::{
    Account, CoreEvent, Error, FetchedMessage, Mailbox, MailboxRole, RenderedBody, Result,
    SyncErrorKind, SyncStatus, now_millis,
};
use mail_store::{MailboxSyncState, Store};
use proto_imap::{ImapConnection, uid_set};
use tokio::sync::{mpsc, oneshot};

use crate::events::Events;
use crate::operations::{self, MAX_ATTEMPTS, Operation, Source};

const FETCH_BATCH_SIZE: usize = 50;
const CONNECTION_IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const CONNECTION_CHECK_AFTER_MS: i64 = 30 * 1000;
const MAILBOX_LIST_MAX_AGE: Duration = Duration::from_secs(15 * 60);
const FLAG_RESYNC_INTERVAL_MS: i64 = 5 * 60 * 1000;
const SYNC_WINDOW_MS: i64 = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_MAILBOXES: usize = 5;

pub enum Command {
    Sync {
        mailbox_ids: Option<Vec<i64>>,
        force: bool,
    },
    LoadOlder {
        mailbox_id: i64,
    },
    FetchBody {
        email_id: i64,
        reply: oneshot::Sender<Result<RenderedBody>>,
    },
    SaveAttachment {
        email_id: i64,
        index: u32,
        directory: PathBuf,
        reply: oneshot::Sender<Result<String>>,
    },
    DrainOperations,
    Disconnect,
    SyncInboxes {
        reply: oneshot::Sender<()>,
    },
}

pub type Secret = Arc<RwLock<Option<String>>>;

/// When the running command last made progress, in milliseconds; 0 while the worker waits.
pub type Heartbeat = Arc<AtomicI64>;

pub struct Worker {
    pub account: Account,
    pub secret: Secret,
    pub store: Arc<Store>,
    pub events: Events,
    pub receiver: mpsc::UnboundedReceiver<Command>,
    heartbeat: Heartbeat,
    deferred: VecDeque<Command>,
    connection: Option<ImapConnection>,
    /// When the kept connection was last used, in milliseconds of wall time, which goes on while
    /// the phone sleeps.
    connection_used_at: i64,
    active_mailboxes: VecDeque<i64>,
    mailbox_list_refreshed_at: Option<Instant>,
}

impl Worker {
    pub fn new(
        account: Account,
        secret: Secret,
        store: Arc<Store>,
        events: Events,
        receiver: mpsc::UnboundedReceiver<Command>,
        heartbeat: Heartbeat,
    ) -> Worker {
        Worker {
            account,
            secret,
            store,
            events,
            receiver,
            heartbeat,
            deferred: VecDeque::new(),
            connection: None,
            connection_used_at: 0,
            active_mailboxes: VecDeque::new(),
            mailbox_list_refreshed_at: None,
        }
    }

    pub async fn run(mut self) {
        loop {
            let command = match self.deferred.pop_front() {
                Some(command) => command,
                None => {
                    let retry_delay = self.next_retry_delay();
                    tokio::select! {
                        command = self.receiver.recv() => match command {
                            Some(command) => command,
                            None => break,
                        },
                        _ = tokio::time::sleep(retry_delay.unwrap_or_default()), if retry_delay.is_some() => Command::DrainOperations,
                        _ = tokio::time::sleep(CONNECTION_IDLE_TIMEOUT), if self.connection.is_some() => Command::Disconnect,
                    }
                }
            };
            self.beat();
            self.handle(command).await;
            self.heartbeat.store(0, Ordering::SeqCst);
        }
        self.disconnect().await;
    }

    fn beat(&self) {
        self.heartbeat.store(now_millis(), Ordering::SeqCst);
    }

    async fn handle(&mut self, command: Command) {
        match command {
            Command::Sync { mailbox_ids, force } => {
                let mut targets = mailbox_ids;
                let mut force = force;
                while let Some(position) = self
                    .deferred
                    .iter()
                    .position(|queued| matches!(queued, Command::Sync { .. }))
                {
                    if let Some(Command::Sync {
                        mailbox_ids: queued_ids,
                        force: queued_force,
                    }) = self.deferred.remove(position)
                    {
                        force |= queued_force;
                        targets = match (targets, queued_ids) {
                            (Some(mut ids), Some(queued_ids)) => {
                                ids.extend(queued_ids);
                                Some(ids)
                            }
                            _ => None,
                        };
                    }
                }
                self.sync(targets, force).await;
            }
            Command::LoadOlder { mailbox_id } => {
                if let Ok(mut state) = self.store.mailbox_sync_state(mailbox_id) {
                    let start = state
                        .sync_since
                        .unwrap_or_else(|| now_millis() - SYNC_WINDOW_MS);
                    state.sync_since = Some(start - SYNC_WINDOW_MS);
                    state.synced_at = None;
                    if self
                        .store
                        .save_mailbox_sync_state(mailbox_id, &state)
                        .is_ok()
                    {
                        self.sync(Some(vec![mailbox_id]), true).await;
                    }
                }
            }
            Command::DrainOperations => {
                if let Err(error) = self.drain_operations().await {
                    self.report(error);
                }
            }
            Command::Disconnect => self.disconnect().await,
            Command::SyncInboxes { reply } => {
                let inboxes = self
                    .store
                    .mailbox_by_role(&self.account.id, MailboxRole::Inbox)
                    .ok()
                    .flatten()
                    .map(|inbox| vec![inbox.id]);
                self.sync(inboxes, true).await;
                let _ = reply.send(());
            }
            urgent => self.handle_urgent(urgent).await,
        }
    }

    async fn handle_urgent(&mut self, command: Command) {
        match command {
            Command::FetchBody { email_id, reply } => {
                let mut result = self.fetch_body(email_id).await;
                if retry_on_new_connection(&result) {
                    self.connection = None;
                    result = self.fetch_body(email_id).await;
                }
                if let Err(error) = &result {
                    self.forget_connection_on(error);
                }
                let _ = reply.send(result);
            }
            Command::SaveAttachment {
                email_id,
                index,
                directory,
                reply,
            } => {
                let mut result = self
                    .save_attachment(email_id, index, directory.clone())
                    .await;
                if retry_on_new_connection(&result) {
                    self.connection = None;
                    result = self.save_attachment(email_id, index, directory).await;
                }
                if let Err(error) = &result {
                    self.forget_connection_on(error);
                }
                let _ = reply.send(result);
            }
            other => self.deferred.push_back(other),
        }
    }

    async fn serve_urgent(&mut self) {
        while let Ok(command) = self.receiver.try_recv() {
            match command {
                Command::DrainOperations => {
                    let _ = self.drain_operations().await;
                }
                command @ (Command::FetchBody { .. } | Command::SaveAttachment { .. }) => {
                    self.handle_urgent(command).await
                }
                other => self.deferred.push_back(other),
            }
        }
    }

    fn next_retry_delay(&self) -> Option<Duration> {
        let retry_at = self
            .store
            .next_operation_retry_at(&self.account.id)
            .ok()
            .flatten()?;
        Some(Duration::from_millis(
            retry_at.saturating_sub(now_millis()).max(0) as u64,
        ))
    }

    fn has_secret(&self) -> bool {
        self.secret
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_some()
    }

    fn keep_connection(&mut self, connection: ImapConnection) {
        self.connection = Some(connection);
        self.connection_used_at = now_millis();
    }

    async fn take_connection(&mut self) -> Result<ImapConnection> {
        if let Some(mut connection) = self.connection.take() {
            // Servers and NATs drop idle connections without a word: one left aside a while is
            // checked first, so the command that needs it does not fail on a dead socket.
            let idle = now_millis() - self.connection_used_at > CONNECTION_CHECK_AFTER_MS;
            if !idle || connection.noop().await.is_ok() {
                return Ok(connection);
            }
        }
        let secret = self
            .secret
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .ok_or(Error::Auth)?;
        proto_imap::connect(&self.account.imap, &self.account.username, &secret).await
    }

    fn forget_connection_on(&mut self, error: &Error) {
        if matches!(error, Error::Network(_) | Error::Auth) {
            self.connection = None;
        }
    }

    async fn disconnect(&mut self) {
        if let Some(connection) = self.connection.take() {
            connection.logout().await;
        }
    }

    fn set_status(&self, status: SyncStatus) {
        self.events.emit(CoreEvent::SyncState {
            account_id: self.account.id.clone(),
            status,
        });
    }

    fn report(&mut self, error: Error) {
        self.forget_connection_on(&error);
        let (kind, message) = match &error {
            Error::Auth => {
                self.events.emit(CoreEvent::AuthRequired {
                    account_id: self.account.id.clone(),
                });
                (SyncErrorKind::Auth, error.to_string())
            }
            Error::Network(message) => (SyncErrorKind::Network, message.clone()),
            other => (SyncErrorKind::Server, other.to_string()),
        };
        self.set_status(SyncStatus::Failed { kind, message });
    }

    async fn sync(&mut self, mailbox_ids: Option<Vec<i64>>, force: bool) {
        if !self.has_secret() {
            return;
        }
        self.set_status(SyncStatus::Syncing);
        let mut result = self.sync_once(mailbox_ids.clone(), force).await;
        if matches!(result, Err(Error::Network(_))) {
            result = self.sync_once(mailbox_ids, force).await;
        }
        match result {
            Ok(()) => self.set_status(SyncStatus::Idle {
                last_synced_at: Some(now_millis()),
            }),
            Err(error) => self.report(error),
        }
    }

    async fn sync_once(&mut self, mailbox_ids: Option<Vec<i64>>, force: bool) -> Result<()> {
        self.drain_operations().await?;
        let stale_list = self
            .mailbox_list_refreshed_at
            .is_none_or(|at| at.elapsed() > MAILBOX_LIST_MAX_AGE);
        if force || stale_list {
            self.refresh_mailbox_list().await?;
        }
        for mailbox in self.targets(mailbox_ids)? {
            self.sync_mailbox(&mailbox, force).await?;
        }
        Ok(())
    }

    async fn refresh_mailbox_list(&mut self) -> Result<()> {
        let mut connection = self.take_connection().await?;
        let remote_mailboxes = connection.list_mailboxes().await;
        self.keep_connection(connection);
        self.store
            .replace_mailboxes(&self.account.id, &remote_mailboxes?)?;
        self.mailbox_list_refreshed_at = Some(Instant::now());
        self.events.emit(CoreEvent::AccountsChanged);
        Ok(())
    }

    fn targets(&mut self, mailbox_ids: Option<Vec<i64>>) -> Result<Vec<Mailbox>> {
        let mailboxes = self.store.list_mailboxes(Some(&self.account.id))?;
        if let Some(ids) = mailbox_ids {
            for id in &ids {
                self.active_mailboxes.retain(|active| active != id);
                self.active_mailboxes.push_front(*id);
            }
            self.active_mailboxes.truncate(MAX_ACTIVE_MAILBOXES);
            return Ok(mailboxes
                .into_iter()
                .filter(|mailbox| ids.contains(&mailbox.id) && mailbox.selectable)
                .collect());
        }
        Ok(mailboxes
            .into_iter()
            .filter(|mailbox| mailbox.selectable)
            .filter(|mailbox| {
                mailbox
                    .role
                    .is_some_and(MailboxRole::is_synced_in_background)
                    || self.active_mailboxes.contains(&mailbox.id)
            })
            .collect())
    }

    async fn with_imap<T>(
        &mut self,
        remote_name: Option<&str>,
        action: impl AsyncFnOnce(&mut ImapConnection) -> Result<T>,
    ) -> Result<T> {
        let mut connection = self.take_connection().await?;
        let result = async {
            if let Some(remote_name) = remote_name {
                connection.ensure_selected(remote_name).await?;
            }
            action(&mut connection).await
        }
        .await;
        self.beat();
        if !matches!(result, Err(Error::Network(_) | Error::Auth)) {
            self.keep_connection(connection);
        }
        result
    }

    async fn sync_mailbox(&mut self, mailbox: &Mailbox, force: bool) -> Result<()> {
        let remote_name = mailbox.remote_name.as_str();
        let (status, condstore) = self
            .with_imap(None, async |connection| {
                Ok((
                    connection.status(remote_name).await?,
                    connection.capabilities.condstore,
                ))
            })
            .await?;
        if self
            .store
            .set_mailbox_counts(mailbox.id, status.messages, status.unseen)?
        {
            self.events.mailboxes_changed([mailbox.id]);
        }
        let state = self.store.mailbox_sync_state(mailbox.id)?;
        let window_start = state
            .sync_since
            .unwrap_or_else(|| now_millis() - SYNC_WINDOW_MS);
        let flags_unchanged = match (condstore, status.highest_modseq) {
            (true, Some(modseq)) => state.highest_modseq == Some(modseq),
            _ => {
                !force
                    && state
                        .synced_at
                        .is_some_and(|at| now_millis() - at < FLAG_RESYNC_INTERVAL_MS)
            }
        };
        let unchanged = state.synced_at.is_some()
            && status.uid_next.is_some()
            && state.uidvalidity == status.uid_validity
            && state.uidnext == status.uid_next
            && flags_unchanged;
        if unchanged {
            return Ok(());
        }

        let selected = self
            .with_imap(None, async |connection| {
                connection.select(remote_name).await
            })
            .await?;
        let same_validity =
            state.uidvalidity.is_some() && state.uidvalidity == selected.uid_validity;
        if state.uidvalidity.is_some() && !same_validity {
            self.store
                .remove_uids(mailbox.id, &self.store.local_uids(mailbox.id)?)?;
        }
        let server_uids: HashSet<u32> = self
            .with_imap(Some(remote_name), async |connection| {
                connection.search_since(window_start).await
            })
            .await?
            .into_iter()
            .collect();
        let local_uids: HashSet<u32> = self.store.local_uids(mailbox.id)?.into_iter().collect();
        let removed: Vec<u32> = local_uids.difference(&server_uids).copied().collect();
        self.store.remove_uids(mailbox.id, &removed)?;
        let held = operations::held_uids(&self.store, &self.account.id, mailbox.id)?;
        let mut new_uids: Vec<u32> = server_uids
            .difference(&local_uids)
            .filter(|uid| !held.contains(uid))
            .copied()
            .collect();
        new_uids.sort_unstable_by(|left, right| right.cmp(left));
        for batch in new_uids.chunks(FETCH_BATCH_SIZE) {
            let summaries = self
                .with_imap(Some(remote_name), async |connection| {
                    connection.fetch_summaries(batch).await
                })
                .await?;
            let messages: Vec<FetchedMessage> = summaries
                .into_iter()
                .filter(|summary| !summary.flags.deleted)
                .map(|summary| FetchedMessage {
                    uid: summary.uid,
                    flags: summary.flags,
                    internal_date: summary.internal_date,
                    size: summary.size,
                    headers: mail_mime::parse_summary(&summary.header, &summary.text),
                })
                .collect();
            self.store
                .insert_messages(&self.account.id, mailbox.id, &messages)?;
            self.events.mailboxes_changed([mailbox.id]);
            self.serve_urgent().await;
        }

        let known_uids: Vec<u32> = local_uids.intersection(&server_uids).copied().collect();
        let changed_since = state.highest_modseq.filter(|_| condstore && same_validity);
        let flag_updates = match changed_since {
            Some(modseq) => {
                self.with_imap(Some(remote_name), async |connection| {
                    connection.fetch_flags("1:*", Some(modseq)).await
                })
                .await?
            }
            None if !known_uids.is_empty() => {
                let set = uid_set(&known_uids);
                self.with_imap(Some(remote_name), async |connection| {
                    connection.fetch_flags(&set, None).await
                })
                .await?
            }
            None => Vec::new(),
        };
        let updates: Vec<_> = flag_updates
            .iter()
            .map(|update| (update.uid, update.flags))
            .collect();
        let local_changes_pending = self.store.has_pending_operations(&self.account.id)?;
        if !local_changes_pending {
            self.store.update_flags(mailbox.id, &updates)?;
            self.store.clear_unconfirmed_links(mailbox.id)?;
        }
        self.store.save_mailbox_sync_state(
            mailbox.id,
            &MailboxSyncState {
                uidvalidity: selected.uid_validity,
                uidnext: status.uid_next.max(selected.uid_next),
                highest_modseq: if local_changes_pending {
                    state.highest_modseq.filter(|_| same_validity)
                } else {
                    selected.highest_modseq.or(status.highest_modseq)
                },
                sync_since: Some(window_start),
                synced_at: (!local_changes_pending).then(now_millis),
            },
        )?;
        self.events.mailboxes_changed([mailbox.id]);
        Ok(())
    }

    async fn fetch_raw(&mut self, email_id: i64) -> Result<Vec<u8>> {
        let (remote_name, uid) = self.store.fetch_location(email_id)?;
        self.with_imap(Some(&remote_name), async |connection| {
            connection.fetch_raw(uid).await
        })
        .await
    }

    async fn fetch_body(&mut self, email_id: i64) -> Result<RenderedBody> {
        if let Some(body) = self.store.body(email_id)? {
            return Ok(body);
        }
        let body = mail_mime::render(&self.fetch_raw(email_id).await?)?;
        self.store.save_body(email_id, &body)?;
        Ok(body)
    }

    async fn save_attachment(
        &mut self,
        email_id: i64,
        index: u32,
        directory: PathBuf,
    ) -> Result<String> {
        let raw = self.fetch_raw(email_id).await?;
        let (filename, bytes) = mail_mime::attachment(&raw, index).ok_or(Error::NotFound)?;
        let safe_name: String = filename
            .chars()
            .map(|character| {
                if matches!(character, '/' | '\\' | '\0') {
                    '_'
                } else {
                    character
                }
            })
            .collect();
        let target = directory
            .join(format!("{email_id}-{index}"))
            .join(safe_name);
        let parent = target.parent().ok_or(Error::NotFound)?;
        std::fs::create_dir_all(parent).map_err(|error| Error::Storage(error.to_string()))?;
        std::fs::write(&target, bytes).map_err(|error| Error::Storage(error.to_string()))?;
        Ok(target.to_string_lossy().into_owned())
    }

    pub async fn drain_operations(&mut self) -> Result<()> {
        if !self.has_secret() {
            return Ok(());
        }
        let mut changed_mailboxes = HashSet::new();
        for pending in self.store.due_operations(&self.account.id, now_millis())? {
            let Some(payload) = self.store.begin_operation(pending.id)? else {
                continue;
            };
            let Ok(operation) = serde_json::from_str::<Operation>(&payload) else {
                self.store
                    .fail_operation(pending.id, "unreadable operation")?;
                continue;
            };
            match self.execute(&operation, &mut changed_mailboxes).await {
                Ok(()) => self.store.complete_operation(pending.id)?,
                Err(error @ (Error::Network(_) | Error::Auth)) => {
                    let attempts = pending.attempts + 1;
                    self.store.postpone_operation(
                        pending.id,
                        attempts,
                        now_millis() + operations::backoff_ms(attempts),
                        &error.to_string(),
                    )?;
                    return Err(error);
                }
                Err(error) => {
                    let attempts = pending.attempts + 1;
                    if attempts >= MAX_ATTEMPTS
                        || matches!(
                            error,
                            Error::Server(_) | Error::InvalidInput(_) | Error::NotFound
                        )
                    {
                        self.store.fail_operation(pending.id, &error.to_string())?;
                        self.events.emit(CoreEvent::OpFailed {
                            account_id: self.account.id.clone(),
                            message: error.to_string(),
                        });
                    } else {
                        self.store.postpone_operation(
                            pending.id,
                            attempts,
                            now_millis() + operations::backoff_ms(attempts),
                            &error.to_string(),
                        )?;
                    }
                }
            }
        }
        if !changed_mailboxes.is_empty() {
            for mailbox_id in &changed_mailboxes {
                if let Ok(mut state) = self.store.mailbox_sync_state(*mailbox_id) {
                    state.synced_at = None;
                    self.store.save_mailbox_sync_state(*mailbox_id, &state)?;
                }
            }
        }
        Ok(())
    }

    /// Fills in the UID of messages whose last move reached the server before their new
    /// mailbox was synced, by looking them up by Message-ID. Messages no longer there are dropped.
    async fn locate_on_server(&mut self, sources: &[Source]) -> Result<Vec<Source>> {
        let mut located = Vec::with_capacity(sources.len());
        let mut claimed: HashSet<(i64, u32)> = sources
            .iter()
            .filter_map(|source| source.uid.map(|uid| (source.mailbox_id, uid)))
            .collect();
        for source in sources {
            if source.uid.is_some() {
                located.push(*source);
                continue;
            }
            let Some(message_id) = self.store.email_message_id(source.email_id)? else {
                continue;
            };
            let remote_name = self.store.mailbox(source.mailbox_id)?.remote_name;
            let uids = self
                .with_imap(Some(&remote_name), async |connection| {
                    connection.search_message_id(&message_id).await
                })
                .await?;
            if let Some(uid) = newest_unclaimed(source.mailbox_id, uids, &mut claimed) {
                located.push(Source {
                    uid: Some(uid),
                    ..*source
                });
            }
        }
        Ok(located)
    }

    async fn execute(
        &mut self,
        operation: &Operation,
        changed_mailboxes: &mut HashSet<i64>,
    ) -> Result<()> {
        match operation {
            Operation::SetKeywords {
                email_ids,
                add,
                remove,
            } => {
                let locations = self.store.locations(email_ids)?;
                let sources: Vec<Source> = locations.into_iter().map(Source::from).collect();
                for (mailbox_id, uids) in group_by_mailbox(&sources) {
                    let remote_name = self.store.mailbox(mailbox_id)?.remote_name;
                    let added: Vec<&str> = add.iter().map(|keyword| keyword.imap_flag()).collect();
                    let removed: Vec<&str> =
                        remove.iter().map(|keyword| keyword.imap_flag()).collect();
                    self.with_imap(Some(&remote_name), async |connection| {
                        if !added.is_empty() {
                            connection.store_flags(&uids, true, &added).await?;
                        }
                        if !removed.is_empty() {
                            connection.store_flags(&uids, false, &removed).await?;
                        }
                        Ok(())
                    })
                    .await?;
                    changed_mailboxes.insert(mailbox_id);
                }
                Ok(())
            }
            Operation::Move {
                sources,
                target_mailbox_id,
            } => {
                let target = self.store.mailbox(*target_mailbox_id)?.remote_name;
                let sources = self.locate_on_server(sources).await?;
                for (mailbox_id, uids) in group_by_mailbox(&sources) {
                    let remote_name = self.store.mailbox(mailbox_id)?.remote_name;
                    self.with_imap(Some(&remote_name), async |connection| {
                        connection.move_messages(&uids, &target).await
                    })
                    .await?;
                    changed_mailboxes.insert(mailbox_id);
                }
                changed_mailboxes.insert(*target_mailbox_id);
                Ok(())
            }
            Operation::Delete { sources } => {
                let sources = self.locate_on_server(sources).await?;
                for (mailbox_id, uids) in group_by_mailbox(&sources) {
                    let remote_name = self.store.mailbox(mailbox_id)?.remote_name;
                    self.with_imap(Some(&remote_name), async |connection| {
                        connection.delete_messages(&uids).await
                    })
                    .await?;
                    changed_mailboxes.insert(mailbox_id);
                }
                Ok(())
            }
            Operation::Send {
                raw,
                envelope_from,
                recipients,
            } => {
                let secret = self
                    .secret
                    .read()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .clone()
                    .ok_or(Error::Auth)?;
                proto_smtp::send(
                    &self.account.smtp,
                    &self.account.username,
                    &secret,
                    envelope_from,
                    recipients,
                    raw.as_bytes(),
                )
                .await?;
                if !self.account.is_gmail() {
                    operations::enqueue(
                        &self.store,
                        &self.account.id,
                        &Operation::AppendSent { raw: raw.clone() },
                    )?;
                }
                Ok(())
            }
            Operation::AppendSent { raw } => {
                let Some(sent) = self
                    .store
                    .mailbox_by_role(&self.account.id, MailboxRole::Sent)?
                else {
                    return Ok(());
                };
                self.with_imap(None, async |connection| {
                    connection.append(&sent.remote_name, raw.as_bytes()).await
                })
                .await?;
                changed_mailboxes.insert(sent.id);
                Ok(())
            }
        }
    }
}

/// A connection the server closed half-way answers a FETCH with nothing, then fails on the next
/// write: what the user is waiting for gets one more try on a new connection.
fn retry_on_new_connection<T>(result: &Result<T>) -> bool {
    matches!(result, Err(Error::NotFound | Error::Network(_)))
}

/// The newest of `found` that no other copy in the mailbox took yet, claimed for this copy.
fn newest_unclaimed(
    mailbox_id: i64,
    found: Vec<u32>,
    claimed: &mut HashSet<(i64, u32)>,
) -> Option<u32> {
    let uid = found
        .into_iter()
        .filter(|uid| !claimed.contains(&(mailbox_id, *uid)))
        .max()?;
    claimed.insert((mailbox_id, uid));
    Some(uid)
}

fn group_by_mailbox(sources: &[Source]) -> BTreeMap<i64, Vec<u32>> {
    let mut groups: BTreeMap<i64, Vec<u32>> = BTreeMap::new();
    for source in sources {
        if let Some(uid) = source.uid {
            groups.entry(source.mailbox_id).or_default().push(uid);
        }
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_copies_of_a_message_take_different_uids() {
        let mut claimed = HashSet::from([(1, 9)]);
        assert_eq!(newest_unclaimed(1, vec![4, 9], &mut claimed), Some(4));
        assert_eq!(newest_unclaimed(1, vec![4, 9], &mut claimed), None);
        assert_eq!(newest_unclaimed(2, vec![4, 9], &mut claimed), Some(9));
    }
}
