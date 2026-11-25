mod credentials;
mod events;
mod operations;
mod worker;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use std::time::Duration;

use mail_mime::{AttachmentContent, OutgoingMessage};
use mail_model::{
    Account, AccountConfig, Address, Authentication, Category, CoreEvent, Credential, Draft,
    EmailSummary, Error, Keyword, MAX_ATTACHMENTS_BYTES, Mailbox, MailboxRole, NewMessage,
    OutgoingAttachment, RenderedBody, Result, SearchHit, ServerConfig, ThreadFilter, ThreadPage,
    ThreadScope, UnsubscribeOutcome, now_millis,
};
use mail_store::Store;
use tokio::runtime::Handle;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use credentials::TokenCache;
pub use events::EventSink;
use events::Events;
pub use mail_auth::oauth::SignInRequest;
use mail_auth::oauth::{self, Grant, Identity, PendingSignIn};
use operations::Operation;
use worker::{Command, Heartbeat, Secret, Worker};

const PERIODIC_SYNC_INTERVAL: Duration = Duration::from_secs(3 * 60);
const IDLE_RENEWAL: Duration = Duration::from_secs(25 * 60);
const IDLE_RECONNECT_DELAY: Duration = Duration::from_secs(30);
const UNSUBSCRIBE_TIMEOUT: Duration = Duration::from_secs(15);
const STALLED_WORKER_TIMEOUT_MS: i64 = 20 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Destination {
    Mailbox(i64),
    Inbox,
    Archive,
    Junk,
    Trash,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relocation {
    pub email_ids: Vec<i64>,
    pub target_mailbox_id: Option<i64>,
}

struct AccountHandle {
    account: Account,
    secret: Secret,
    smtp_secret: Secret,
    tokens: TokenCache,
    commands: mpsc::UnboundedSender<Command>,
    worker: JoinHandle<()>,
    heartbeat: Heartbeat,
    idle: Option<JoinHandle<()>>,
}

impl AccountHandle {
    fn stalled(&self, before: i64) -> bool {
        let busy_since = self.heartbeat.load(Ordering::SeqCst);
        self.worker.is_finished() || (busy_since != 0 && busy_since <= before)
    }
}

pub struct Engine {
    store: Arc<Store>,
    runtime: Handle,
    events: Events,
    accounts: Mutex<HashMap<String, AccountHandle>>,
    foreground: AtomicBool,
    backgrounded_at: AtomicI64,
    ticker: Mutex<Option<JoinHandle<()>>>,
    pending_sign_in: Mutex<Option<PendingAccount>>,
}

struct PendingAccount {
    sign_in: PendingSignIn,
    email: Option<String>,
    servers: Option<ServerConfig>,
}

impl Engine {
    pub fn open(data_directory: &Path, runtime: Handle) -> Result<Arc<Engine>> {
        std::fs::create_dir_all(data_directory)
            .map_err(|error| Error::Storage(error.to_string()))?;
        let store = Arc::new(Store::open(&data_directory.join("mail.db"))?);
        store.reset_in_flight_operations(None)?;
        let indexer = store.clone();
        runtime.spawn_blocking(move || {
            while indexer.index_text_without_spaces().unwrap_or(false) {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        });
        let engine = Arc::new(Engine {
            store,
            runtime,
            events: Events::start(),
            accounts: Mutex::default(),
            foreground: AtomicBool::new(false),
            backgrounded_at: AtomicI64::new(0),
            ticker: Mutex::default(),
            pending_sign_in: Mutex::default(),
        });
        for account in engine.store.list_accounts()? {
            engine.start_worker(account, None, None);
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

    fn start_worker(&self, account: Account, secret: Option<String>, token: Option<(String, i64)>) {
        let handle = self.spawn_worker(
            account,
            Arc::new(RwLock::new(secret)),
            Arc::new(RwLock::new(None)),
            Arc::new(tokio::sync::Mutex::new(token)),
            None,
        );
        self.accounts().insert(handle.account.id.clone(), handle);
    }

    fn spawn_worker(
        &self,
        account: Account,
        secret: Secret,
        smtp_secret: Secret,
        tokens: TokenCache,
        idle: Option<JoinHandle<()>>,
    ) -> AccountHandle {
        let (commands, receiver) = mpsc::unbounded_channel();
        let heartbeat = Heartbeat::default();
        let worker = Worker::new(
            account.clone(),
            secret.clone(),
            smtp_secret.clone(),
            tokens.clone(),
            self.store.clone(),
            self.events.clone(),
            receiver,
            heartbeat.clone(),
        );
        AccountHandle {
            worker: self.runtime.spawn(worker.run()),
            account,
            secret,
            smtp_secret,
            tokens,
            commands,
            heartbeat,
            idle,
        }
    }

    fn restart_stalled_workers(&self, before: i64) {
        for handle in self.accounts().values_mut() {
            if !handle.stalled(before) {
                continue;
            }
            handle.worker.abort();
            let _ = self
                .store
                .reset_in_flight_operations(Some(&handle.account.id));
            *handle = self.spawn_worker(
                handle.account.clone(),
                handle.secret.clone(),
                handle.smtp_secret.clone(),
                handle.tokens.clone(),
                handle.idle.take(),
            );
            let _ = handle.commands.send(Command::Sync {
                mailbox_ids: None,
                force: false,
            });
        }
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

    pub async fn add_account(
        &self,
        config: AccountConfig,
        secret: String,
        smtp_secret: Option<String>,
    ) -> Result<Account> {
        self.ensure_new(&config.email)?;
        let credential = Credential::Password(secret.clone());
        let connection = proto_imap::connect(&config.imap, &config.username, &credential).await?;
        connection.logout().await;
        proto_smtp::verify(
            &config.smtp,
            config.smtp_username.as_deref().unwrap_or(&config.username),
            &Credential::Password(smtp_secret.clone().unwrap_or_else(|| secret.clone())),
        )
        .await?;
        let account = Account {
            id: uuid::Uuid::new_v4().to_string(),
            email: config.email.trim().to_owned(),
            display_name: config.display_name.trim().to_owned(),
            username: config.username,
            smtp_username: config.smtp_username,
            imap: config.imap,
            smtp: config.smtp,
            color: self.store.next_account_color()?,
            created_at: now_millis(),
            authentication: Authentication::Password,
            oauth_server: None,
        };
        self.register(&account, secret, None)?;
        if let Some(smtp_secret) = smtp_secret {
            self.unlock_smtp(&account.id, smtp_secret);
        }
        Ok(account)
    }

    fn ensure_new(&self, email: &str) -> Result<()> {
        if self.store.has_account_for(email)? {
            return Err(Error::AccountExists);
        }
        Ok(())
    }

    fn register(
        &self,
        account: &Account,
        secret: String,
        token: Option<(String, i64)>,
    ) -> Result<()> {
        self.store.insert_account(account)?;
        self.store.set_notified_until(&account.id, now_millis())?;
        self.start_worker(account.clone(), Some(secret), token);
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
        Ok(())
    }

    pub fn begin_sign_in(
        &self,
        provider: Authentication,
        login_hint: Option<String>,
    ) -> Result<SignInRequest> {
        let (request, sign_in) = oauth::begin(provider, login_hint.as_deref())?;
        self.remember(PendingAccount {
            sign_in,
            email: None,
            servers: None,
        });
        Ok(request)
    }

    fn remember(&self, pending: PendingAccount) {
        *self
            .pending_sign_in
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pending);
    }

    pub async fn probe_oauth(
        &self,
        email: &str,
        imap: &mail_model::ServerEndpoint,
    ) -> Result<Option<String>> {
        let Some(configuration) = proto_imap::oauth_configuration(imap, email).await? else {
            return Ok(None);
        };
        Ok(mail_auth::server::discover(&configuration)
            .await
            .ok()
            .map(|metadata| metadata.issuer))
    }

    pub async fn begin_server_sign_in(
        &self,
        email: &str,
        servers: ServerConfig,
    ) -> Result<SignInRequest> {
        let email = email.trim();
        self.ensure_new(email)?;
        let configuration = proto_imap::oauth_configuration(&servers.imap, email)
            .await?
            .ok_or_else(|| Error::Server("this server does not offer OAuth sign-in".into()))?;
        let metadata = mail_auth::server::discover(&configuration).await?;
        let server = mail_auth::server::register(&metadata).await?;
        self.begin_at_server(&server, email, servers)
    }

    fn begin_at_server(
        &self,
        server: &mail_model::OAuthServer,
        email: &str,
        servers: ServerConfig,
    ) -> Result<SignInRequest> {
        let resources = mail_auth::server::served_resources(
            &server.issuer,
            &[servers.imap.host.as_str(), servers.smtp.host.as_str()],
        );
        let resources: Vec<&str> = resources.iter().map(String::as_str).collect();
        let (request, sign_in) = oauth::begin_server(server, email, &resources)?;
        self.remember(PendingAccount {
            sign_in,
            email: Some(email.to_owned()),
            servers: Some(servers),
        });
        Ok(request)
    }

    pub fn begin_account_sign_in(&self, account_id: &str) -> Result<SignInRequest> {
        let account = self.store.account(account_id)?;
        match (account.authentication, &account.oauth_server) {
            (Authentication::Password, _) => Err(Error::InvalidInput(
                "this account signs in with a password".into(),
            )),
            (Authentication::Server, Some(server)) => self.begin_at_server(
                server,
                &account.email,
                ServerConfig {
                    imap: account.imap.clone(),
                    smtp: account.smtp.clone(),
                    username: account.username.clone(),
                    smtp_username: None,
                },
            ),
            (Authentication::Server, None) => Err(Error::InvalidInput(
                "no OAuth server for this account".into(),
            )),
            (provider, _) => self.begin_sign_in(provider, Some(account.email)),
        }
    }

    async fn finish_sign_in(
        &self,
        callback_url: &str,
    ) -> Result<(PendingAccount, Grant, Identity, String)> {
        let pending = self
            .pending_sign_in
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
            .ok_or_else(|| Error::InvalidInput("no sign-in in progress".into()))?;
        let code = oauth::authorization_code(callback_url, &pending.sign_in)?;
        let grant = oauth::exchange(&pending.sign_in, &code).await?;
        let identity = grant
            .identity
            .clone()
            .or_else(|| {
                pending.email.clone().map(|email| Identity {
                    email,
                    name: None,
                    tenant: None,
                })
            })
            .ok_or_else(|| Error::Server("the provider did not give the address".into()))?;
        let refresh_token = grant
            .refresh_token
            .clone()
            .ok_or_else(|| Error::Server("the provider did not allow offline access".into()))?;
        Ok((pending, grant, identity, refresh_token))
    }

    pub async fn add_oauth_account(
        &self,
        callback_url: &str,
        display_name: &str,
    ) -> Result<Account> {
        let (pending, grant, identity, refresh_token) = self.finish_sign_in(callback_url).await?;
        let authentication = pending.sign_in.provider;
        self.ensure_new(&identity.email)?;
        let config = match pending.servers {
            Some(mut servers) => {
                if servers.username.trim().is_empty() {
                    servers.username = identity.email.clone();
                }
                servers
            }
            None => oauth::servers(authentication, &identity),
        };
        let credential = credentials::token_credential(authentication, grant.access_token.clone());
        let connection = proto_imap::connect(&config.imap, &config.username, &credential)
            .await
            .map_err(|error| refused_sign_in(error, &config.imap.host, &identity.email))?;
        connection.logout().await;
        match proto_smtp::verify(&config.smtp, &config.username, &credential).await {
            Ok(()) | Err(Error::Server(_)) => {}
            Err(error) => {
                return Err(refused_sign_in(error, &config.smtp.host, &identity.email));
            }
        }
        let display_name = [display_name, identity.name.as_deref().unwrap_or_default()]
            .into_iter()
            .map(str::trim)
            .find(|name| !name.is_empty())
            .unwrap_or(&identity.email)
            .to_owned();
        let account = Account {
            id: uuid::Uuid::new_v4().to_string(),
            email: identity.email.clone(),
            display_name,
            username: config.username,
            smtp_username: None,
            imap: config.imap,
            smtp: config.smtp,
            color: self.store.next_account_color()?,
            created_at: now_millis(),
            authentication,
            oauth_server: pending.sign_in.server,
        };
        self.register(
            &account,
            refresh_token.clone(),
            Some((grant.access_token, grant.expires_at)),
        )?;
        self.events.emit(CoreEvent::SecretChanged {
            account_id: account.id.clone(),
            secret: refresh_token,
        });
        Ok(account)
    }

    pub async fn reauthorize(&self, account_id: &str, callback_url: &str) -> Result<()> {
        let account = self.store.account(account_id)?;
        let (pending, grant, identity, refresh_token) = self.finish_sign_in(callback_url).await?;
        let authentication = pending.sign_in.provider;
        if authentication != account.authentication
            || !identity.email.eq_ignore_ascii_case(&account.email)
        {
            return Err(Error::InvalidInput(format!(
                "signed in as {}",
                identity.email
            )));
        }
        let connection = proto_imap::connect(
            &account.imap,
            &account.username,
            &credentials::token_credential(authentication, grant.access_token.clone()),
        )
        .await
        .map_err(|error| refused_sign_in(error, &account.imap.host, &identity.email))?;
        connection.logout().await;
        let tokens = self
            .accounts()
            .get(account_id)
            .map(|handle| handle.tokens.clone());
        if let Some(tokens) = tokens {
            *tokens.lock().await = Some((grant.access_token, grant.expires_at));
        }
        self.unlock_account(account_id, refresh_token.clone());
        self.events.emit(CoreEvent::SecretChanged {
            account_id: account_id.to_owned(),
            secret: refresh_token,
        });
        self.dispatch(
            account_id,
            Command::Sync {
                mailbox_ids: None,
                force: true,
            },
        );
        Ok(())
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

    pub fn unlock_smtp(&self, account_id: &str, secret: String) {
        if let Some(handle) = self.accounts().get(account_id) {
            *handle
                .smtp_secret
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(secret);
        }
    }

    pub async fn update_servers(
        &self,
        account_id: &str,
        servers: ServerConfig,
        secret: Option<String>,
        smtp_secret: Option<String>,
    ) -> Result<()> {
        let account = self.store.account(account_id)?;
        if account.authentication != Authentication::Password {
            return Err(Error::InvalidInput(
                "only password accounts have server settings".into(),
            ));
        }
        let (held_secret, held_smtp_secret) = self
            .accounts()
            .get(account_id)
            .map(|handle| (handle.secret.clone(), handle.smtp_secret.clone()))
            .ok_or(Error::NotFound)?;
        let read = |held: &Secret| {
            held.read()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        };
        let incoming = secret.or_else(|| read(&held_secret)).ok_or(Error::Auth)?;
        let outgoing = match servers.smtp_username {
            Some(_) => smtp_secret
                .clone()
                .or_else(|| read(&held_smtp_secret))
                .unwrap_or_else(|| incoming.clone()),
            None => incoming.clone(),
        };
        let connection = proto_imap::connect(
            &servers.imap,
            &servers.username,
            &Credential::Password(incoming.clone()),
        )
        .await?;
        connection.logout().await;
        proto_smtp::verify(
            &servers.smtp,
            servers
                .smtp_username
                .as_deref()
                .unwrap_or(&servers.username),
            &Credential::Password(outgoing),
        )
        .await?;
        self.store.update_servers(account_id, &servers)?;
        *held_secret
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(incoming);
        if servers.smtp_username.is_none() {
            *held_smtp_secret
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        } else if smtp_secret.is_some() {
            *held_smtp_secret
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = smtp_secret;
        }
        let account = self.store.account(account_id)?;
        if let Some(handle) = self.accounts().get_mut(account_id) {
            handle.worker.abort();
            if let Some(idle) = handle.idle.take() {
                idle.abort();
            }
            let _ = self.store.reset_in_flight_operations(Some(account_id));
            *handle = self.spawn_worker(
                account,
                handle.secret.clone(),
                handle.smtp_secret.clone(),
                handle.tokens.clone(),
                None,
            );
        }
        if self.foreground.load(Ordering::SeqCst) {
            self.start_idle(account_id);
        }
        self.dispatch(
            account_id,
            Command::Sync {
                mailbox_ids: None,
                force: true,
            },
        );
        self.events.emit(CoreEvent::AccountsChanged);
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

    pub fn set_account_color(&self, account_id: &str, color: u32) -> Result<()> {
        self.store.set_account_color(account_id, color)?;
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
        filter: &ThreadFilter,
        category: Option<Category>,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<ThreadPage> {
        self.store
            .list_threads(scope, filter, category, cursor, limit)
    }

    pub fn set_sender_category(&self, sender: &str, category: Category) -> Result<()> {
        let mailbox_ids = self.store.set_sender_category(sender, category)?;
        self.events.mailboxes_changed(mailbox_ids);
        Ok(())
    }

    pub fn thread_emails(
        &self,
        thread_id: i64,
        context_mailbox_id: Option<i64>,
    ) -> Result<Vec<EmailSummary>> {
        self.store.thread_emails(thread_id, context_mailbox_id)
    }

    pub fn suggest_addresses(&self, query: &str, limit: u32) -> Result<Vec<Address>> {
        self.store.suggest_addresses(query, limit)
    }

    pub fn search(&self, query: &str, limit: u32, mailbox_ids: &[i64]) -> Result<Vec<SearchHit>> {
        self.store.search(query, limit, mailbox_ids)
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
        hold: Duration,
    ) -> Result<Relocation> {
        self.move_emails(
            &self.store.thread_email_ids(mailbox_id, thread_id)?,
            mailbox_id,
            destination,
            hold,
        )
    }

    pub fn move_emails(
        &self,
        email_ids: &[i64],
        from_mailbox_id: i64,
        destination: Destination,
        hold: Duration,
    ) -> Result<Relocation> {
        let from = self.store.mailbox(from_mailbox_id)?;
        let target = self.resolve(&from, destination)?;
        let relocation = Relocation {
            email_ids: email_ids.to_vec(),
            target_mailbox_id: target,
        };
        if email_ids.is_empty() || target == Some(from.id) {
            return Ok(relocation);
        }
        let sources = self.store.move_emails(email_ids, from.id, target)?;
        let not_before = now_millis() + hold.as_millis() as i64;
        operations::enqueue_relocation(&self.store, &from.account_id, sources, target, not_before)?;
        self.events
            .mailboxes_changed(std::iter::once(from.id).chain(target));
        self.dispatch(&from.account_id, Command::DrainOperations);
        Ok(relocation)
    }

    fn resolve(&self, from: &Mailbox, destination: Destination) -> Result<Option<i64>> {
        let by_role = |role| self.store.mailbox_by_role(&from.account_id, role);
        Ok(match destination {
            Destination::Mailbox(mailbox_id) => Some(mailbox_id),
            Destination::Inbox => Some(
                by_role(MailboxRole::Inbox)?
                    .ok_or_else(|| Error::InvalidInput("no inbox".into()))?
                    .id,
            ),
            Destination::Junk => Some(
                by_role(MailboxRole::Junk)?
                    .ok_or_else(|| Error::InvalidInput("no junk mailbox".into()))?
                    .id,
            ),
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
        self.queue_send(draft, true)
    }

    fn queue_send(&self, draft: Draft, remember_recipients: bool) -> Result<()> {
        if draft.to.is_empty() && draft.cc.is_empty() && draft.bcc.is_empty() {
            return Err(Error::InvalidInput("no recipient".into()));
        }
        let attachments = read_attachments(&draft.attachments)?;
        let account = self.store.account(&draft.account_id)?;
        let reply = draft
            .in_reply_to_email_id
            .map(|email_id| self.store.reply_context(email_id))
            .transpose()?;
        let from = draft.from.clone().unwrap_or_else(|| Address {
            name: Some(account.display_name.clone()),
            email: account.email.clone(),
        });
        let domain = from
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
        let built = mail_mime::build_message(OutgoingMessage {
            message_id: &message_id,
            from: &from,
            to: &draft.to,
            cc: &draft.cc,
            bcc: &draft.bcc,
            subject: &draft.subject,
            body_text: &draft.body_text,
            body_html: draft.body_html.as_deref(),
            in_reply_to: reply
                .as_ref()
                .and_then(|context| context.message_id.as_deref()),
            references: &references,
            attachments,
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
        let recipients: Vec<Address> = draft
            .to
            .iter()
            .chain(&draft.cc)
            .chain(&draft.bcc)
            .cloned()
            .collect();
        if remember_recipients {
            self.store.record_sent(&recipients, now_millis())?;
        }
        self.dispatch(&account.id, Command::DrainOperations);
        Ok(())
    }

    pub fn unsubscribe(&self, email_id: i64) -> Result<UnsubscribeOutcome> {
        let not_a_list = || Error::InvalidInput("not from a mailing list".into());
        let unsubscribe = self
            .store
            .body(email_id)?
            .and_then(|body| body.unsubscribe)
            .ok_or_else(not_a_list)?;
        if let (true, Some(url)) = (unsubscribe.one_click, unsubscribe.https_url.as_deref())
            && post_one_click(url).is_ok()
        {
            return Ok(UnsubscribeOutcome::Done);
        }
        if let Some(mailto) = unsubscribe.mailto.as_deref() {
            self.queue_send(self.unsubscribe_draft(email_id, mailto)?, false)?;
            return Ok(UnsubscribeOutcome::Done);
        }
        unsubscribe
            .https_url
            .map(|url| UnsubscribeOutcome::OpenInBrowser { url })
            .ok_or_else(not_a_list)
    }

    fn unsubscribe_draft(&self, email_id: i64, mailto: &str) -> Result<Draft> {
        let url = url::Url::parse(mailto)
            .map_err(|_| Error::InvalidInput(format!("invalid unsubscribe address: {mailto}")))?;
        let email = percent_encoding::percent_decode_str(url.path())
            .decode_utf8_lossy()
            .into_owned();
        let parameter = |name: &str| {
            url.query_pairs()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .map(|(_, value)| value.into_owned())
        };
        Ok(Draft {
            account_id: self.store.account_of_email(email_id)?,
            to: vec![Address { name: None, email }],
            cc: vec![],
            bcc: vec![],
            subject: parameter("subject").unwrap_or_else(|| "unsubscribe".into()),
            body_text: parameter("body").unwrap_or_else(|| "unsubscribe".into()),
            body_html: None,
            in_reply_to_email_id: None,
            attachments: vec![],
            from: None,
        })
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
        self.restart_stalled_workers(self.backgrounded_at.load(Ordering::SeqCst));
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
                engine.restart_stalled_workers(now_millis() - STALLED_WORKER_TIMEOUT_MS);
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

    pub async fn check_new_mail(&self, budget: Duration) -> Result<Vec<NewMessage>> {
        let replies: Vec<oneshot::Receiver<()>> = self
            .accounts()
            .values()
            .filter_map(|handle| {
                let (reply, receiver) = oneshot::channel();
                handle
                    .commands
                    .send(Command::SyncInboxes { reply })
                    .ok()
                    .map(|_| receiver)
            })
            .collect();
        let _ = tokio::time::timeout(budget, async {
            for reply in replies {
                let _ = reply.await;
            }
        })
        .await;
        let mut found = Vec::new();
        for account in self.store.list_accounts()? {
            let after = self.store.notified_until(&account.id)?;
            found.extend(self.store.unread_inbox_emails_after(&account.id, after)?);
            self.store.advance_notified_until(&account.id)?;
        }
        found.sort_by_key(|message| message.email.received_at);
        Ok(found)
    }

    pub fn on_background(&self) {
        for account in self.store.list_accounts().unwrap_or_default() {
            let _ = self.store.advance_notified_until(&account.id);
        }
        self.backgrounded_at.store(now_millis(), Ordering::SeqCst);
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
        let tokens = handle.tokens.clone();
        let commands = handle.commands.clone();
        let store = self.store.clone();
        let events = self.events.clone();
        handle.idle = Some(self.runtime.spawn(watch_inbox(
            account, secret, tokens, events, store, commands,
        )));
    }
}

fn refused_sign_in(error: Error, host: &str, email: &str) -> Error {
    match error {
        Error::Auth => Error::Server(format!("{host} refused the sign-in of {email}")),
        other => other,
    }
}

async fn watch_inbox(
    account: Account,
    secret: Secret,
    tokens: TokenCache,
    events: Events,
    store: Arc<Store>,
    commands: mpsc::UnboundedSender<Command>,
) {
    loop {
        let inbox = store
            .mailbox_by_role(&account.id, MailboxRole::Inbox)
            .ok()
            .flatten();
        if let Some(inbox) = inbox
            && let Ok(credential) =
                credentials::credential(&account, &secret, &tokens, &events).await
            && let Ok(mut connection) =
                proto_imap::connect(&account.imap, &account.username, &credential).await
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

fn post_one_click(url: &str) -> Result<()> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(UNSUBSCRIBE_TIMEOUT))
        .build()
        .into();
    agent
        .post(url)
        .send_form([("List-Unsubscribe", "One-Click")])
        .map(|_| ())
        .map_err(|error| Error::Network(error.to_string()))
}

fn read_attachments(attachments: &[OutgoingAttachment]) -> Result<Vec<AttachmentContent>> {
    let unreadable = |attachment: &OutgoingAttachment| {
        Error::InvalidInput(format!("cannot read attachment {}", attachment.filename))
    };
    let mut total = 0;
    for attachment in attachments {
        total += std::fs::metadata(&attachment.path)
            .map_err(|_| unreadable(attachment))?
            .len();
    }
    if total > MAX_ATTACHMENTS_BYTES {
        return Err(Error::InvalidInput(format!(
            "attachments exceed {MAX_ATTACHMENTS_BYTES} bytes"
        )));
    }
    attachments
        .iter()
        .map(|attachment| {
            Ok(AttachmentContent {
                filename: attachment.filename.clone(),
                mime_type: attachment.mime_type.clone(),
                bytes: std::fs::read(&attachment.path).map_err(|_| unreadable(attachment))?,
            })
        })
        .collect()
}

#[cfg(test)]
#[path = "../../../tests/mail_sync/test_support.rs"]
pub(crate) mod test_support;

#[cfg(test)]
#[path = "../../../tests/mail_sync/lib.rs"]
mod tests;
