mod events;
mod operations;
mod worker;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use std::time::Duration;

use mail_mime::OutgoingMessage;
use mail_model::{
    Account, AccountConfig, Address, CoreEvent, Draft, EmailSummary, Error, Keyword, Mailbox,
    MailboxRole, RenderedBody, Result, ServerConfig, ThreadPage, ThreadScope, now_millis,
};
use mail_store::Store;
use tokio::runtime::Handle;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

pub use events::EventSink;
use events::Events;
use operations::Operation;
use worker::{Command, Secret, Worker};

const PERIODIC_SYNC_INTERVAL: Duration = Duration::from_secs(3 * 60);
const IDLE_RENEWAL: Duration = Duration::from_secs(25 * 60);
const IDLE_RECONNECT_DELAY: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Destination {
    Mailbox(i64),
    Archive,
    Trash,
}

struct AccountHandle {
    account: Account,
    secret: Secret,
    commands: mpsc::UnboundedSender<Command>,
    worker: JoinHandle<()>,
    idle: Option<JoinHandle<()>>,
}

pub struct Engine {
    store: Arc<Store>,
    runtime: Handle,
    events: Events,
    accounts: Mutex<HashMap<String, AccountHandle>>,
    foreground: AtomicBool,
    ticker: Mutex<Option<JoinHandle<()>>>,
}

impl Engine {
    pub fn open(data_directory: &Path, runtime: Handle) -> Result<Arc<Engine>> {
        std::fs::create_dir_all(data_directory)
            .map_err(|error| Error::Storage(error.to_string()))?;
        let store = Arc::new(Store::open(&data_directory.join("mail.db"))?);
        store.reset_in_flight_operations()?;
        let engine = Arc::new(Engine {
            store,
            runtime,
            events: Events::start(),
            accounts: Mutex::default(),
            foreground: AtomicBool::new(false),
            ticker: Mutex::default(),
        });
        for account in engine.store.list_accounts()? {
            engine.start_worker(account, None);
        }
        Ok(engine)
    }

    pub fn set_event_sink(&self, sink: EventSink) {
        self.events.set_sink(sink);
    }

    fn accounts(&self) -> MutexGuard<'_, HashMap<String, AccountHandle>> {
        self.accounts
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn start_worker(&self, account: Account, secret: Option<String>) {
        let secret: Secret = Arc::new(RwLock::new(secret));
        let (commands, receiver) = mpsc::unbounded_channel();
        let worker = Worker::new(
            account.clone(),
            secret.clone(),
            self.store.clone(),
            self.events.clone(),
            receiver,
        );
        let worker = self.runtime.spawn(worker.run());
        let handle = AccountHandle {
            account,
            secret,
            commands,
            worker,
            idle: None,
        };
        self.accounts().insert(handle.account.id.clone(), handle);
    }

    fn dispatch(&self, account_id: &str, command: Command) {
        if let Some(handle) = self.accounts().get(account_id) {
            let _ = handle.commands.send(command);
        }
    }

    async fn request<T>(
        &self,
        account_id: &str,
        command: impl FnOnce(oneshot::Sender<Result<T>>) -> Command,
    ) -> Result<T> {
        let (reply, response) = oneshot::channel();
        self.dispatch(account_id, command(reply));
        response.await.map_err(|_| Error::NotFound)?
    }

    pub async fn discover(&self, email: &str) -> Result<ServerConfig> {
        mail_auth::discover(email).await
    }

    pub async fn add_account(&self, config: AccountConfig, secret: String) -> Result<Account> {
        let connection = proto_imap::connect(&config.imap, &config.username, &secret).await?;
        connection.logout().await;
        proto_smtp::verify(&config.smtp, &config.username, &secret).await?;
        let account = Account {
            id: uuid::Uuid::new_v4().to_string(),
            email: config.email.trim().to_owned(),
            display_name: config.display_name.trim().to_owned(),
            username: config.username,
            imap: config.imap,
            smtp: config.smtp,
            color: self.store.next_account_color()?,
            created_at: now_millis(),
        };
        self.store.insert_account(&account)?;
        self.start_worker(account.clone(), Some(secret));
        if self.foreground.load(Ordering::SeqCst) {
            self.start_idle(&account.id);
        }
        self.dispatch(
            &account.id,
            Command::Sync {
                mailbox_ids: None,
                force: true,
            },
        );
        self.events.emit(CoreEvent::AccountsChanged);
        Ok(account)
    }

    pub fn unlock_account(&self, account_id: &str, secret: String) {
        let unlocked = match self.accounts().get(account_id) {
            Some(handle) => {
                *handle
                    .secret
                    .write()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(secret);
                true
            }
            None => false,
        };
        if unlocked && self.foreground.load(Ordering::SeqCst) {
            self.start_idle(account_id);
            self.dispatch(
                account_id,
                Command::Sync {
                    mailbox_ids: None,
                    force: false,
                },
            );
        }
    }

    pub async fn update_password(&self, account_id: &str, secret: String) -> Result<()> {
        let account = self.store.account(account_id)?;
        let connection = proto_imap::connect(&account.imap, &account.username, &secret).await?;
        connection.logout().await;
        self.unlock_account(account_id, secret);
        self.dispatch(
            account_id,
            Command::Sync {
                mailbox_ids: None,
                force: true,
            },
        );
        Ok(())
    }

    pub fn list_accounts(&self) -> Result<Vec<Account>> {
        self.store.list_accounts()
    }

    pub fn rename_account(&self, account_id: &str, display_name: &str) -> Result<()> {
        self.store.rename_account(account_id, display_name.trim())?;
        self.events.emit(CoreEvent::AccountsChanged);
        Ok(())
    }

    pub fn remove_account(&self, account_id: &str) -> Result<()> {
        if let Some(handle) = self.accounts().remove(account_id) {
            handle.worker.abort();
            if let Some(idle) = handle.idle {
                idle.abort();
            }
        }
        self.store.delete_account(account_id)?;
        self.events.emit(CoreEvent::AccountsChanged);
        Ok(())
    }

    pub fn list_mailboxes(&self, account_id: Option<&str>) -> Result<Vec<Mailbox>> {
        self.store.list_mailboxes(account_id)
    }

    pub fn list_threads(
        &self,
        scope: ThreadScope,
        unread_only: bool,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<ThreadPage> {
        self.store.list_threads(scope, unread_only, cursor, limit)
    }

    pub fn thread_emails(
        &self,
        thread_id: i64,
        context_mailbox_id: Option<i64>,
    ) -> Result<Vec<EmailSummary>> {
        self.store.thread_emails(thread_id, context_mailbox_id)
    }

    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<EmailSummary>> {
        self.store.search(query, limit)
    }

    pub async fn body(&self, email_id: i64) -> Result<RenderedBody> {
        if let Some(body) = self.store.body(email_id)? {
            return Ok(body);
        }
        let account_id = self.store.account_of_email(email_id)?;
        self.request(&account_id, |reply| Command::FetchBody { email_id, reply })
            .await
    }

    pub async fn save_attachment(
        &self,
        email_id: i64,
        index: u32,
        directory: PathBuf,
    ) -> Result<String> {
        let account_id = self.store.account_of_email(email_id)?;
        self.request(&account_id, |reply| Command::SaveAttachment {
            email_id,
            index,
            directory,
            reply,
        })
        .await
    }

    pub fn set_keywords(
        &self,
        email_ids: &[i64],
        add: &[Keyword],
        remove: &[Keyword],
    ) -> Result<()> {
        let mut by_account: HashMap<String, Vec<i64>> = HashMap::new();
        for email_id in email_ids {
            by_account
                .entry(self.store.account_of_email(*email_id)?)
                .or_default()
                .push(*email_id);
        }
        for (account_id, ids) in by_account {
            let changed_mailboxes = self.store.set_keywords(&ids, add, remove)?;
            self.events.mailboxes_changed(changed_mailboxes);
            operations::enqueue_keywords(
                &self.store,
                &account_id,
                ids,
                add.to_vec(),
                remove.to_vec(),
            )?;
            self.dispatch(&account_id, Command::DrainOperations);
        }
        Ok(())
    }

    pub fn set_thread_keywords(
        &self,
        mailbox_id: i64,
        thread_id: i64,
        add: &[Keyword],
        remove: &[Keyword],
    ) -> Result<()> {
        self.set_keywords(
            &self.store.thread_email_ids(mailbox_id, thread_id)?,
            add,
            remove,
        )
    }

    pub fn move_thread(
        &self,
        mailbox_id: i64,
        thread_id: i64,
        destination: Destination,
    ) -> Result<()> {
        self.move_emails(
            &self.store.thread_email_ids(mailbox_id, thread_id)?,
            mailbox_id,
            destination,
        )
    }

    pub fn move_emails(
        &self,
        email_ids: &[i64],
        from_mailbox_id: i64,
        destination: Destination,
    ) -> Result<()> {
        if email_ids.is_empty() {
            return Ok(());
        }
        let from = self.store.mailbox(from_mailbox_id)?;
        let target = self.resolve(&from, destination)?;
        if target == Some(from.id) {
            return Ok(());
        }
        let sources = self.store.move_emails(email_ids, from.id, target)?;
        operations::enqueue_relocation(&self.store, &from.account_id, sources, target)?;
        self.events
            .mailboxes_changed(std::iter::once(from.id).chain(target));
        self.dispatch(&from.account_id, Command::DrainOperations);
        Ok(())
    }

    fn resolve(&self, from: &Mailbox, destination: Destination) -> Result<Option<i64>> {
        let by_role = |role| self.store.mailbox_by_role(&from.account_id, role);
        Ok(match destination {
            Destination::Mailbox(mailbox_id) => Some(mailbox_id),
            Destination::Archive => Some(
                by_role(MailboxRole::Archive)?
                    .or(by_role(MailboxRole::All)?)
                    .ok_or_else(|| Error::InvalidInput("no archive mailbox".into()))?
                    .id,
            ),
            Destination::Trash if from.role == Some(MailboxRole::Trash) => None,
            Destination::Trash => by_role(MailboxRole::Trash)?.map(|trash| trash.id),
        })
    }

    pub fn send(&self, draft: Draft) -> Result<()> {
        if draft.to.is_empty() && draft.cc.is_empty() && draft.bcc.is_empty() {
            return Err(Error::InvalidInput("no recipient".into()));
        }
        let account = self.store.account(&draft.account_id)?;
        let reply = draft
            .in_reply_to_email_id
            .map(|email_id| self.store.reply_context(email_id))
            .transpose()?;
        let domain = account
            .email
            .rsplit_once('@')
            .map(|(_, domain)| domain)
            .unwrap_or("localhost");
        let message_id = format!("{}@{domain}", uuid::Uuid::new_v4());
        let mut references = reply
            .as_ref()
            .map(|context| context.references.clone())
            .unwrap_or_default();
        references.extend(
            reply
                .as_ref()
                .and_then(|context| context.message_id.clone()),
        );
        let from = Address {
            name: Some(account.display_name.clone()),
            email: account.email.clone(),
        };
        let built = mail_mime::build_message(&OutgoingMessage {
            message_id: &message_id,
            from: &from,
            to: &draft.to,
            cc: &draft.cc,
            bcc: &draft.bcc,
            subject: &draft.subject,
            body_text: &draft.body_text,
            in_reply_to: reply
                .as_ref()
                .and_then(|context| context.message_id.as_deref()),
            references: &references,
        })?;
        let raw = String::from_utf8(built.raw)
            .map_err(|_| Error::InvalidInput("message is not 7-bit safe".into()))?;
        operations::enqueue(
            &self.store,
            &account.id,
            &Operation::Send {
                raw,
                envelope_from: built.envelope_from,
                recipients: built.recipients,
            },
        )?;
        if let Some(email_id) = draft.in_reply_to_email_id {
            self.set_keywords(&[email_id], &[Keyword::Answered], &[])?;
        }
        self.dispatch(&account.id, Command::DrainOperations);
        Ok(())
    }

    pub fn sync_now(&self, account_id: Option<&str>) {
        let account_ids: Vec<String> = match account_id {
            Some(account_id) => vec![account_id.to_owned()],
            None => self.accounts().keys().cloned().collect(),
        };
        for account_id in account_ids {
            self.dispatch(
                &account_id,
                Command::Sync {
                    mailbox_ids: None,
                    force: true,
                },
            );
        }
    }

    pub fn open_mailbox(&self, mailbox_id: i64) -> Result<()> {
        let mailbox = self.store.mailbox(mailbox_id)?;
        self.dispatch(
            &mailbox.account_id,
            Command::Sync {
                mailbox_ids: Some(vec![mailbox_id]),
                force: false,
            },
        );
        Ok(())
    }

    pub fn load_older(&self, mailbox_id: i64) -> Result<()> {
        let mailbox = self.store.mailbox(mailbox_id)?;
        self.dispatch(&mailbox.account_id, Command::LoadOlder { mailbox_id });
        Ok(())
    }

    pub fn on_foreground(self: &Arc<Self>) {
        if self.foreground.swap(true, Ordering::SeqCst) {
            return;
        }
        let account_ids: Vec<String> = self.accounts().keys().cloned().collect();
        for account_id in &account_ids {
            self.start_idle(account_id);
            self.dispatch(
                account_id,
                Command::Sync {
                    mailbox_ids: None,
                    force: false,
                },
            );
        }
        let engine = Arc::downgrade(self);
        let ticker = self.runtime.spawn(async move {
            loop {
                tokio::time::sleep(PERIODIC_SYNC_INTERVAL).await;
                let Some(engine) = engine.upgrade() else {
                    return;
                };
                let account_ids: Vec<String> = engine.accounts().keys().cloned().collect();
                for account_id in account_ids {
                    engine.dispatch(
                        &account_id,
                        Command::Sync {
                            mailbox_ids: None,
                            force: false,
                        },
                    );
                }
            }
        });
        if let Some(previous) = self
            .ticker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .replace(ticker)
        {
            previous.abort();
        }
    }

    pub fn on_background(&self) {
        if !self.foreground.swap(false, Ordering::SeqCst) {
            return;
        }
        if let Some(ticker) = self
            .ticker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
        {
            ticker.abort();
        }
        for handle in self.accounts().values_mut() {
            if let Some(idle) = handle.idle.take() {
                idle.abort();
            }
            let _ = handle.commands.send(Command::Disconnect);
        }
    }

    fn start_idle(&self, account_id: &str) {
        let mut accounts = self.accounts();
        let Some(handle) = accounts.get_mut(account_id) else {
            return;
        };
        if handle.idle.as_ref().is_some_and(|idle| !idle.is_finished()) {
            return;
        }
        let account = handle.account.clone();
        let secret = handle.secret.clone();
        let commands = handle.commands.clone();
        let store = self.store.clone();
        handle.idle = Some(
            self.runtime
                .spawn(watch_inbox(account, secret, store, commands)),
        );
    }
}

async fn watch_inbox(
    account: Account,
    secret: Secret,
    store: Arc<Store>,
    commands: mpsc::UnboundedSender<Command>,
) {
    loop {
        let password = secret
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        let inbox = store
            .mailbox_by_role(&account.id, MailboxRole::Inbox)
            .ok()
            .flatten();
        if let (Some(password), Some(inbox)) = (password, inbox)
            && let Ok(mut connection) =
                proto_imap::connect(&account.imap, &account.username, &password).await
        {
            if !connection.capabilities.idle {
                connection.logout().await;
                return;
            }
            while let Ok((next, changed)) = connection
                .wait_for_changes(&inbox.remote_name, IDLE_RENEWAL)
                .await
            {
                connection = next;
                if changed {
                    let _ = commands.send(Command::Sync {
                        mailbox_ids: Some(vec![inbox.id]),
                        force: true,
                    });
                }
            }
        }
        tokio::time::sleep(IDLE_RECONNECT_DELAY).await;
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use mail_model::{Account, Security, ServerEndpoint};
    use mail_store::Store;

    pub fn store() -> Store {
        let directory = std::env::temp_dir().join(format!(
            "mail-sync-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        Store::open(&directory.join("mail.db")).unwrap()
    }

    pub fn account(id: &str) -> Account {
        let endpoint = ServerEndpoint {
            host: "imap.example.com".into(),
            port: 993,
            security: Security::Tls,
        };
        Account {
            id: id.into(),
            email: format!("{id}@example.com"),
            display_name: id.into(),
            username: id.into(),
            imap: endpoint.clone(),
            smtp: endpoint,
            color: 0,
            created_at: 0,
        }
    }
}
