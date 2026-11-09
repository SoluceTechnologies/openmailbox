use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use mail_sync::Engine;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("network: {message}")]
    Network { message: String },
    #[error("authentication failed")]
    Auth,
    #[error("server: {message}")]
    Server { message: String },
    #[error("storage: {message}")]
    Storage { message: String },
    #[error("not found")]
    NotFound,
    #[error("invalid input: {message}")]
    InvalidInput { message: String },
}

impl From<mail_model::Error> for CoreError {
    fn from(error: mail_model::Error) -> CoreError {
        use mail_model::Error;
        match error {
            Error::Network(message) => CoreError::Network { message },
            Error::Auth => CoreError::Auth,
            Error::Server(message) => CoreError::Server { message },
            Error::Storage(message) => CoreError::Storage { message },
            Error::NotFound => CoreError::NotFound,
            Error::InvalidInput(message) => CoreError::InvalidInput { message },
        }
    }
}

type CoreResult<T> = Result<T, CoreError>;

fn parse_id(value: &str) -> CoreResult<i64> {
    value.parse().map_err(|_| CoreError::InvalidInput {
        message: format!("invalid id: {value}"),
    })
}

fn parse_ids(values: &[String]) -> CoreResult<Vec<i64>> {
    values.iter().map(|value| parse_id(value)).collect()
}

#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum Security {
    Tls,
    StartTls,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ServerEndpoint {
    pub host: String,
    pub port: u16,
    pub security: Security,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ServerConfig {
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
    pub username: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct AccountConfig {
    pub email: String,
    pub display_name: String,
    pub username: String,
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub username: String,
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
    pub color: u32,
}

#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum MailboxRole {
    Inbox,
    Sent,
    Drafts,
    Trash,
    Junk,
    Archive,
    All,
    Flagged,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Mailbox {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub depth: u32,
    pub role: Option<MailboxRole>,
    pub selectable: bool,
    pub total_count: u32,
    pub unread_count: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Address {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct EmailSummary {
    pub id: String,
    pub account_id: String,
    pub thread_id: String,
    pub subject: Option<String>,
    pub from: Vec<Address>,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub preview: Option<String>,
    pub received_at: f64,
    pub is_seen: bool,
    pub is_flagged: bool,
    pub is_answered: bool,
    pub has_attachment: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ThreadSummary {
    pub key: String,
    pub thread_id: String,
    pub mailbox_id: String,
    pub account_id: String,
    pub latest: EmailSummary,
    pub message_count: u32,
    pub unread_count: u32,
    pub is_flagged: bool,
    pub has_attachment: bool,
    pub last_received_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ThreadPage {
    pub threads: Vec<ThreadSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Attachment {
    pub index: u32,
    pub filename: String,
    pub mime_type: String,
    pub size: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RenderedBody {
    pub html: Option<String>,
    pub text: String,
    pub has_remote_content: bool,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Draft {
    pub account_id: String,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub bcc: Vec<Address>,
    pub subject: String,
    pub body_text: String,
    pub in_reply_to_email_id: Option<String>,
    pub attachments: Vec<OutgoingAttachment>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct OutgoingAttachment {
    pub path: String,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum Keyword {
    Seen,
    Flagged,
    Answered,
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum Destination {
    Mailbox { mailbox_id: String },
    Inbox,
    Archive,
    Junk,
    Trash,
}

impl Destination {
    fn into_engine(self) -> CoreResult<mail_sync::Destination> {
        Ok(match self {
            Destination::Mailbox { mailbox_id } => {
                mail_sync::Destination::Mailbox(parse_id(&mailbox_id)?)
            }
            Destination::Inbox => mail_sync::Destination::Inbox,
            Destination::Archive => mail_sync::Destination::Archive,
            Destination::Junk => mail_sync::Destination::Junk,
            Destination::Trash => mail_sync::Destination::Trash,
        })
    }
}

/// Where a move left the messages; `target_mailbox_id` is absent when they were deleted for good.
#[derive(Debug, Clone, uniffi::Record)]
pub struct Relocation {
    pub email_ids: Vec<String>,
    pub target_mailbox_id: Option<String>,
}

impl From<mail_sync::Relocation> for Relocation {
    fn from(relocation: mail_sync::Relocation) -> Self {
        Self {
            email_ids: relocation.email_ids.iter().map(i64::to_string).collect(),
            target_mailbox_id: relocation.target_mailbox_id.map(|id| id.to_string()),
        }
    }
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum ThreadScope {
    Unified,
    Mailbox { mailbox_id: String },
}

#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum SyncErrorKind {
    Network,
    Auth,
    Server,
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum SyncStatus {
    Idle {
        last_synced_at: Option<f64>,
    },
    Syncing,
    Failed {
        kind: SyncErrorKind,
        message: String,
    },
    Offline,
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum CoreEvent {
    MailboxesChanged {
        mailbox_ids: Vec<String>,
    },
    AccountsChanged,
    SyncState {
        account_id: String,
        status: SyncStatus,
    },
    AuthRequired {
        account_id: String,
    },
    OpFailed {
        account_id: String,
        message: String,
    },
}

#[uniffi::export(with_foreign)]
pub trait EventListener: Send + Sync {
    fn on_event(&self, event: CoreEvent);
}

impl From<mail_model::Security> for Security {
    fn from(security: mail_model::Security) -> Security {
        match security {
            mail_model::Security::Tls => Security::Tls,
            mail_model::Security::StartTls => Security::StartTls,
        }
    }
}

impl From<Security> for mail_model::Security {
    fn from(security: Security) -> mail_model::Security {
        match security {
            Security::Tls => mail_model::Security::Tls,
            Security::StartTls => mail_model::Security::StartTls,
        }
    }
}

impl From<mail_model::ServerEndpoint> for ServerEndpoint {
    fn from(endpoint: mail_model::ServerEndpoint) -> ServerEndpoint {
        ServerEndpoint {
            host: endpoint.host,
            port: endpoint.port,
            security: endpoint.security.into(),
        }
    }
}

impl From<ServerEndpoint> for mail_model::ServerEndpoint {
    fn from(endpoint: ServerEndpoint) -> mail_model::ServerEndpoint {
        mail_model::ServerEndpoint {
            host: endpoint.host,
            port: endpoint.port,
            security: endpoint.security.into(),
        }
    }
}

impl From<mail_model::Account> for Account {
    fn from(account: mail_model::Account) -> Account {
        Account {
            id: account.id,
            email: account.email,
            display_name: account.display_name,
            username: account.username,
            imap: account.imap.into(),
            smtp: account.smtp.into(),
            color: account.color,
        }
    }
}

impl From<mail_model::MailboxRole> for MailboxRole {
    fn from(role: mail_model::MailboxRole) -> MailboxRole {
        use mail_model::MailboxRole as Role;
        match role {
            Role::Inbox => MailboxRole::Inbox,
            Role::Sent => MailboxRole::Sent,
            Role::Drafts => MailboxRole::Drafts,
            Role::Trash => MailboxRole::Trash,
            Role::Junk => MailboxRole::Junk,
            Role::Archive => MailboxRole::Archive,
            Role::All => MailboxRole::All,
            Role::Flagged => MailboxRole::Flagged,
        }
    }
}

impl From<mail_model::Mailbox> for Mailbox {
    fn from(mailbox: mail_model::Mailbox) -> Mailbox {
        Mailbox {
            id: mailbox.id.to_string(),
            account_id: mailbox.account_id,
            name: mailbox.name,
            depth: mailbox.depth,
            role: mailbox.role.map(Into::into),
            selectable: mailbox.selectable,
            total_count: mailbox.total_count,
            unread_count: mailbox.unread_count,
        }
    }
}

impl From<mail_model::Address> for Address {
    fn from(address: mail_model::Address) -> Address {
        Address {
            name: address.name,
            email: address.email,
        }
    }
}

impl From<Address> for mail_model::Address {
    fn from(address: Address) -> mail_model::Address {
        mail_model::Address {
            name: address.name,
            email: address.email.trim().to_owned(),
        }
    }
}

fn convert_all<From, To: std::convert::From<From>>(addresses: Vec<From>) -> Vec<To> {
    addresses.into_iter().map(Into::into).collect()
}

impl From<mail_model::EmailSummary> for EmailSummary {
    fn from(email: mail_model::EmailSummary) -> EmailSummary {
        EmailSummary {
            id: email.id.to_string(),
            account_id: email.account_id,
            thread_id: email.thread_id.to_string(),
            subject: email.subject,
            from: convert_all(email.from),
            to: convert_all(email.to),
            cc: convert_all(email.cc),
            preview: email.preview,
            received_at: email.received_at as f64,
            is_seen: email.is_seen,
            is_flagged: email.is_flagged,
            is_answered: email.is_answered,
            has_attachment: email.has_attachment,
        }
    }
}

impl From<mail_model::ThreadSummary> for ThreadSummary {
    fn from(thread: mail_model::ThreadSummary) -> ThreadSummary {
        ThreadSummary {
            key: format!("{}:{}", thread.mailbox_id, thread.thread_id),
            thread_id: thread.thread_id.to_string(),
            mailbox_id: thread.mailbox_id.to_string(),
            account_id: thread.account_id,
            latest: thread.latest.into(),
            message_count: thread.message_count,
            unread_count: thread.unread_count,
            is_flagged: thread.is_flagged,
            has_attachment: thread.has_attachment,
            last_received_at: thread.last_received_at as f64,
        }
    }
}

impl From<mail_model::RenderedBody> for RenderedBody {
    fn from(body: mail_model::RenderedBody) -> RenderedBody {
        RenderedBody {
            html: body.html,
            text: body.text,
            has_remote_content: body.has_remote_content,
            attachments: body
                .attachments
                .into_iter()
                .map(|attachment| Attachment {
                    index: attachment.index,
                    filename: attachment.filename,
                    mime_type: attachment.mime_type,
                    size: attachment.size as f64,
                })
                .collect(),
        }
    }
}

impl From<Keyword> for mail_model::Keyword {
    fn from(keyword: Keyword) -> mail_model::Keyword {
        match keyword {
            Keyword::Seen => mail_model::Keyword::Seen,
            Keyword::Flagged => mail_model::Keyword::Flagged,
            Keyword::Answered => mail_model::Keyword::Answered,
        }
    }
}

impl From<mail_model::SyncStatus> for SyncStatus {
    fn from(status: mail_model::SyncStatus) -> SyncStatus {
        use mail_model::SyncStatus as Status;
        match status {
            Status::Idle { last_synced_at } => SyncStatus::Idle {
                last_synced_at: last_synced_at.map(|at| at as f64),
            },
            Status::Syncing => SyncStatus::Syncing,
            Status::Failed { kind, message } => SyncStatus::Failed {
                kind: match kind {
                    mail_model::SyncErrorKind::Network => SyncErrorKind::Network,
                    mail_model::SyncErrorKind::Auth => SyncErrorKind::Auth,
                    mail_model::SyncErrorKind::Server => SyncErrorKind::Server,
                },
                message,
            },
            Status::Offline => SyncStatus::Offline,
        }
    }
}

impl From<mail_model::CoreEvent> for CoreEvent {
    fn from(event: mail_model::CoreEvent) -> CoreEvent {
        use mail_model::CoreEvent as Event;
        match event {
            Event::MailboxesChanged { mailbox_ids } => CoreEvent::MailboxesChanged {
                mailbox_ids: mailbox_ids.iter().map(ToString::to_string).collect(),
            },
            Event::AccountsChanged => CoreEvent::AccountsChanged,
            Event::SyncState { account_id, status } => CoreEvent::SyncState {
                account_id,
                status: status.into(),
            },
            Event::AuthRequired { account_id } => CoreEvent::AuthRequired { account_id },
            Event::OpFailed {
                account_id,
                message,
            } => CoreEvent::OpFailed {
                account_id,
                message,
            },
        }
    }
}

fn keywords(values: Vec<Keyword>) -> Vec<mail_model::Keyword> {
    values.into_iter().map(Into::into).collect()
}

/// A JavaScript reload creates a new `MailCore` while the previous one is still alive in the
/// process: reusing it keeps a single sync engine per database.
static OPEN_CORES: LazyLock<Mutex<HashMap<String, Arc<MailCore>>>> =
    LazyLock::new(Default::default);

#[derive(uniffi::Object)]
pub struct MailCore {
    engine: Arc<Engine>,
    runtime: tokio::runtime::Runtime,
}

impl MailCore {
    async fn blocking<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Engine) -> mail_model::Result<T> + Send + 'static,
    ) -> CoreResult<T> {
        let engine = self.engine.clone();
        self.runtime
            .spawn_blocking(move || work(&engine))
            .await
            .map_err(|error| CoreError::Storage {
                message: error.to_string(),
            })?
            .map_err(Into::into)
    }

    async fn asynchronous<T: Send + 'static, F>(
        &self,
        work: impl FnOnce(Arc<Engine>) -> F,
    ) -> CoreResult<T>
    where
        F: Future<Output = mail_model::Result<T>> + Send + 'static,
    {
        self.runtime
            .spawn(work(self.engine.clone()))
            .await
            .map_err(|error| CoreError::Network {
                message: error.to_string(),
            })?
            .map_err(Into::into)
    }
}

#[uniffi::export]
impl MailCore {
    #[uniffi::constructor]
    pub fn open(data_directory: String) -> CoreResult<Arc<MailCore>> {
        let mut open_cores = OPEN_CORES
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(core) = open_cores.get(&data_directory) {
            return Ok(core.clone());
        }
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("mail-core")
            .enable_all()
            .build()
            .map_err(|error| CoreError::Storage {
                message: error.to_string(),
            })?;
        let engine = Engine::open(&PathBuf::from(&data_directory), runtime.handle().clone())?;
        let core = Arc::new(MailCore { engine, runtime });
        open_cores.insert(data_directory, core.clone());
        Ok(core)
    }

    pub fn subscribe(&self, listener: Arc<dyn EventListener>) {
        self.engine
            .set_event_sink(Arc::new(move |event| listener.on_event(event.into())));
    }

    pub async fn discover(&self, email: String) -> CoreResult<ServerConfig> {
        let config = self
            .asynchronous(async move |engine| engine.discover(&email).await)
            .await?;
        Ok(ServerConfig {
            imap: config.imap.into(),
            smtp: config.smtp.into(),
            username: config.username,
        })
    }

    pub async fn add_account(&self, config: AccountConfig, secret: String) -> CoreResult<Account> {
        let config = mail_model::AccountConfig {
            email: config.email,
            display_name: config.display_name,
            username: config.username,
            imap: config.imap.into(),
            smtp: config.smtp.into(),
        };
        let account = self
            .asynchronous(async move |engine| engine.add_account(config, secret).await)
            .await?;
        Ok(account.into())
    }

    pub fn unlock_account(&self, account_id: String, secret: String) {
        self.engine.unlock_account(&account_id, secret);
    }

    pub async fn update_password(&self, account_id: String, secret: String) -> CoreResult<()> {
        self.asynchronous(async move |engine| engine.update_password(&account_id, secret).await)
            .await
    }

    pub async fn list_accounts(&self) -> CoreResult<Vec<Account>> {
        Ok(convert_all(
            self.blocking(|engine| engine.list_accounts()).await?,
        ))
    }

    pub async fn rename_account(&self, account_id: String, display_name: String) -> CoreResult<()> {
        self.blocking(move |engine| engine.rename_account(&account_id, &display_name))
            .await
    }

    pub async fn remove_account(&self, account_id: String) -> CoreResult<()> {
        self.blocking(move |engine| engine.remove_account(&account_id))
            .await
    }

    pub async fn list_mailboxes(&self, account_id: Option<String>) -> CoreResult<Vec<Mailbox>> {
        Ok(convert_all(
            self.blocking(move |engine| engine.list_mailboxes(account_id.as_deref()))
                .await?,
        ))
    }

    pub async fn list_threads(
        &self,
        scope: ThreadScope,
        unread_only: bool,
        cursor: Option<String>,
        limit: u32,
    ) -> CoreResult<ThreadPage> {
        let scope = match scope {
            ThreadScope::Unified => mail_model::ThreadScope::Unified,
            ThreadScope::Mailbox { mailbox_id } => {
                mail_model::ThreadScope::Mailbox(parse_id(&mailbox_id)?)
            }
        };
        let page = self
            .blocking(move |engine| {
                engine.list_threads(scope, unread_only, cursor.as_deref(), limit)
            })
            .await?;
        Ok(ThreadPage {
            threads: convert_all(page.threads),
            next_cursor: page.next_cursor,
        })
    }

    pub async fn thread_emails(
        &self,
        thread_id: String,
        context_mailbox_id: Option<String>,
    ) -> CoreResult<Vec<EmailSummary>> {
        let thread_id = parse_id(&thread_id)?;
        let context_mailbox_id = context_mailbox_id.as_deref().map(parse_id).transpose()?;
        Ok(convert_all(
            self.blocking(move |engine| engine.thread_emails(thread_id, context_mailbox_id))
                .await?,
        ))
    }

    pub async fn body(&self, email_id: String) -> CoreResult<RenderedBody> {
        let email_id = parse_id(&email_id)?;
        Ok(self
            .asynchronous(async move |engine| engine.body(email_id).await)
            .await?
            .into())
    }

    pub async fn save_attachment(
        &self,
        email_id: String,
        index: u32,
        directory: String,
    ) -> CoreResult<String> {
        let email_id = parse_id(&email_id)?;
        self.asynchronous(async move |engine| {
            engine
                .save_attachment(email_id, index, PathBuf::from(directory))
                .await
        })
        .await
    }

    pub async fn search(&self, query: String, limit: u32) -> CoreResult<Vec<EmailSummary>> {
        Ok(convert_all(
            self.blocking(move |engine| engine.search(&query, limit))
                .await?,
        ))
    }

    pub async fn set_keywords(
        &self,
        email_ids: Vec<String>,
        add: Vec<Keyword>,
        remove: Vec<Keyword>,
    ) -> CoreResult<()> {
        let email_ids = parse_ids(&email_ids)?;
        self.blocking(move |engine| {
            engine.set_keywords(&email_ids, &keywords(add), &keywords(remove))
        })
        .await
    }

    pub async fn set_thread_keywords(
        &self,
        mailbox_id: String,
        thread_id: String,
        add: Vec<Keyword>,
        remove: Vec<Keyword>,
    ) -> CoreResult<()> {
        let (mailbox_id, thread_id) = (parse_id(&mailbox_id)?, parse_id(&thread_id)?);
        self.blocking(move |engine| {
            engine.set_thread_keywords(mailbox_id, thread_id, &keywords(add), &keywords(remove))
        })
        .await
    }

    pub async fn move_thread(
        &self,
        mailbox_id: String,
        thread_id: String,
        destination: Destination,
        hold_ms: u32,
    ) -> CoreResult<Relocation> {
        let (mailbox_id, thread_id) = (parse_id(&mailbox_id)?, parse_id(&thread_id)?);
        let destination = destination.into_engine()?;
        let hold = Duration::from_millis(hold_ms.into());
        self.blocking(move |engine| {
            engine
                .move_thread(mailbox_id, thread_id, destination, hold)
                .map(Relocation::from)
        })
        .await
    }

    pub async fn move_emails(
        &self,
        email_ids: Vec<String>,
        from_mailbox_id: String,
        destination: Destination,
        hold_ms: u32,
    ) -> CoreResult<Relocation> {
        let (email_ids, from_mailbox_id) = (parse_ids(&email_ids)?, parse_id(&from_mailbox_id)?);
        let destination = destination.into_engine()?;
        let hold = Duration::from_millis(hold_ms.into());
        self.blocking(move |engine| {
            engine
                .move_emails(&email_ids, from_mailbox_id, destination, hold)
                .map(Relocation::from)
        })
        .await
    }

    pub async fn send(&self, draft: Draft) -> CoreResult<()> {
        let draft = mail_model::Draft {
            account_id: draft.account_id,
            to: convert_all(draft.to),
            cc: convert_all(draft.cc),
            bcc: convert_all(draft.bcc),
            subject: draft.subject,
            body_text: draft.body_text,
            in_reply_to_email_id: draft
                .in_reply_to_email_id
                .as_deref()
                .map(parse_id)
                .transpose()?,
            attachments: draft
                .attachments
                .into_iter()
                .map(|attachment| mail_model::OutgoingAttachment {
                    path: attachment.path,
                    filename: attachment.filename,
                    mime_type: attachment.mime_type,
                })
                .collect(),
        };
        self.blocking(move |engine| engine.send(draft)).await
    }

    pub fn sync_now(&self, account_id: Option<String>) {
        self.engine.sync_now(account_id.as_deref());
    }

    pub async fn open_mailbox(&self, mailbox_id: String) -> CoreResult<()> {
        let mailbox_id = parse_id(&mailbox_id)?;
        self.blocking(move |engine| engine.open_mailbox(mailbox_id))
            .await
    }

    pub async fn load_older(&self, mailbox_id: String) -> CoreResult<()> {
        let mailbox_id = parse_id(&mailbox_id)?;
        self.blocking(move |engine| engine.load_older(mailbox_id))
            .await
    }

    pub fn on_foreground(&self) {
        self.engine.on_foreground();
    }

    pub fn on_background(&self) {
        self.engine.on_background();
    }
}
