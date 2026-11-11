use std::sync::{Arc, LazyLock};
use std::time::Duration;

use async_imap::extensions::idle::IdleResponse;
use async_imap::imap_proto::NameAttribute;
use async_imap::types::{Fetch, Flag};
use futures::TryStreamExt;
use mail_model::{Error, Flags, MailboxRole, RemoteMailbox, Result, Security, ServerEndpoint};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;

const NETWORK_TIMEOUT: Duration = Duration::from_secs(45);
const NOOP_TIMEOUT: Duration = Duration::from_secs(10);
/// The slowest uplink a large upload is given time for.
const SLOW_UPLINK_BYTES_PER_SECOND: u64 = 32 * 1024;
const SUMMARY_HEADER_FIELDS: &str = "DATE FROM TO CC REPLY-TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES \
     CONTENT-TYPE CONTENT-TRANSFER-ENCODING MIME-VERSION \
     LIST-UNSUBSCRIBE LIST-UNSUBSCRIBE-POST LIST-ID PRECEDENCE AUTO-SUBMITTED X-AUTO-RESPONSE-SUPPRESS \
     X-MAILER X-CSA-COMPLAINTS X-CAMPAIGN X-CAMPAIGNID X-MAILIN-CAMPAIGN X-MAILJET-CAMPAIGN";
const PREVIEW_BYTES: u32 = 2048;
/// Without partial fetches, previews come from whole texts, so only small messages get one.
const WHOLE_TEXT_PREVIEW_MAX_SIZE: u32 = 16 * 1024;

type Session = async_imap::Session<TlsStream<TcpStream>>;

/// Hosts whose FETCH responses for partial sections (`BODY[TEXT]<0>`) cannot be parsed.
static HOSTS_WITHOUT_PARTIAL_FETCH: LazyLock<std::sync::Mutex<std::collections::HashSet<String>>> =
    LazyLock::new(Default::default);

static TLS_CONNECTOR: LazyLock<TlsConnector> = LazyLock::new(|| {
    #[allow(unused_mut)]
    let mut roots = tokio_rustls::rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    #[cfg(feature = "test-ca")]
    if let Some(pem) = option_env!("OPENMAILBOX_TEST_CA") {
        use tokio_rustls::rustls::pki_types::{CertificateDer, pem::PemObject};
        for certificate in CertificateDer::pem_slice_iter(pem.as_bytes()).flatten() {
            let _ = roots.add(certificate);
        }
    }
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("ring supports the default protocol versions")
        .with_root_certificates(roots)
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
});

#[derive(Debug, Clone, Copy, Default)]
pub struct Capabilities {
    pub condstore: bool,
    pub idle: bool,
    pub move_command: bool,
    pub uidplus: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct MailboxStatus {
    pub messages: u32,
    pub unseen: u32,
    pub uid_next: Option<u32>,
    pub uid_validity: Option<u32>,
    pub highest_modseq: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct FetchedSummary {
    pub uid: u32,
    pub flags: Flags,
    pub internal_date: Option<i64>,
    pub size: u32,
    pub header: Vec<u8>,
    pub text: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
pub struct FlagUpdate {
    pub uid: u32,
    pub flags: Flags,
}

pub struct ImapConnection {
    session: Session,
    host: String,
    pub capabilities: Capabilities,
    selected: Option<String>,
}

async fn timed<T>(
    future: impl Future<Output = std::result::Result<T, async_imap::error::Error>>,
) -> Result<T> {
    timed_within(NETWORK_TIMEOUT, future).await
}

fn transfer_timeout(bytes: usize) -> Duration {
    NETWORK_TIMEOUT + Duration::from_secs(bytes as u64 / SLOW_UPLINK_BYTES_PER_SECOND)
}

async fn timed_within<T>(
    timeout: Duration,
    future: impl Future<Output = std::result::Result<T, async_imap::error::Error>>,
) -> Result<T> {
    match tokio::time::timeout(timeout, future).await {
        Ok(result) => result.map_err(map_error),
        Err(_) => Err(Error::Network("timed out".into())),
    }
}

fn map_error(error: async_imap::error::Error) -> Error {
    use async_imap::error::Error as ImapError;
    match error {
        ImapError::Io(error) => Error::Network(readable(error.to_string())),
        ImapError::ConnectionLost => Error::Network("connection lost".into()),
        other => Error::Server(readable(other.to_string())),
    }
}

fn readable(message: String) -> String {
    match message.find("during parsing") {
        Some(position) => format!(
            "unreadable server response ({})",
            message[position..].chars().take(120).collect::<String>()
        ),
        None => message.chars().take(300).collect(),
    }
}

fn network(error: std::io::Error) -> Error {
    Error::Network(error.to_string())
}

pub async fn connect(
    endpoint: &ServerEndpoint,
    username: &str,
    password: &str,
) -> Result<ImapConnection> {
    let stream = tokio::time::timeout(NETWORK_TIMEOUT, open_tls_stream(endpoint))
        .await
        .map_err(|_| Error::Network("timed out".into()))??;
    let mut client = async_imap::Client::new(stream);
    if endpoint.security == Security::Tls {
        timed(async {
            client
                .read_response()
                .await
                .map_err(async_imap::error::Error::Io)
        })
        .await?;
    }
    let mut session =
        match tokio::time::timeout(NETWORK_TIMEOUT, client.login(username, password)).await {
            Ok(Ok(session)) => session,
            Ok(Err((async_imap::error::Error::No(_) | async_imap::error::Error::Bad(_), _))) => {
                return Err(Error::Auth);
            }
            Ok(Err((error, _))) => return Err(map_error(error)),
            Err(_) => return Err(Error::Network("timed out".into())),
        };
    let capabilities = timed(session.capabilities()).await?;
    let capabilities = Capabilities {
        condstore: capabilities.has_str("CONDSTORE") || capabilities.has_str("QRESYNC"),
        idle: capabilities.has_str("IDLE"),
        move_command: capabilities.has_str("MOVE"),
        uidplus: capabilities.has_str("UIDPLUS"),
    };
    Ok(ImapConnection {
        session,
        host: endpoint.host.clone(),
        capabilities,
        selected: None,
    })
}

async fn open_tls_stream(endpoint: &ServerEndpoint) -> Result<TlsStream<TcpStream>> {
    let mut tcp = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
        .await
        .map_err(network)?;
    tcp.set_nodelay(true).map_err(network)?;
    if endpoint.security == Security::StartTls {
        read_line(&mut tcp).await?;
        tcp.write_all(b"a0 STARTTLS\r\n").await.map_err(network)?;
        loop {
            let line = read_line(&mut tcp).await?;
            if let Some(status) = line.strip_prefix("a0 ") {
                if !status.to_ascii_uppercase().starts_with("OK") {
                    return Err(Error::Server(format!("STARTTLS refused: {status}")));
                }
                break;
            }
        }
    }
    let server_name = ServerName::try_from(endpoint.host.clone())
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
    TLS_CONNECTOR
        .connect(server_name, tcp)
        .await
        .map_err(network)
}

async fn read_line(tcp: &mut TcpStream) -> Result<String> {
    let mut line = Vec::new();
    while !line.ends_with(b"\r\n") {
        line.push(tcp.read_u8().await.map_err(network)?);
        if line.len() > 8192 {
            return Err(Error::Server("response line too long".into()));
        }
    }
    Ok(String::from_utf8_lossy(&line).trim_end().to_owned())
}

pub fn uid_set(uids: &[u32]) -> String {
    let mut sorted = uids.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut ranges: Vec<String> = Vec::new();
    let mut index = 0;
    while index < sorted.len() {
        let start = sorted[index];
        let mut end = start;
        while index + 1 < sorted.len() && sorted[index + 1] == end + 1 {
            index += 1;
            end = sorted[index];
        }
        ranges.push(if start == end {
            start.to_string()
        } else {
            format!("{start}:{end}")
        });
        index += 1;
    }
    ranges.join(",")
}

fn flags_of(fetch: &Fetch) -> Flags {
    let mut flags = Flags::default();
    for flag in fetch.flags() {
        match flag {
            Flag::Seen => flags.seen = true,
            Flag::Flagged => flags.flagged = true,
            Flag::Answered => flags.answered = true,
            Flag::Draft => flags.draft = true,
            Flag::Deleted => flags.deleted = true,
            _ => {}
        }
    }
    flags
}

fn declared_role(attributes: &[NameAttribute]) -> Option<MailboxRole> {
    attributes.iter().find_map(|attribute| match attribute {
        NameAttribute::Sent => Some(MailboxRole::Sent),
        NameAttribute::Drafts => Some(MailboxRole::Drafts),
        NameAttribute::Trash => Some(MailboxRole::Trash),
        NameAttribute::Junk => Some(MailboxRole::Junk),
        NameAttribute::Archive => Some(MailboxRole::Archive),
        NameAttribute::All => Some(MailboxRole::All),
        NameAttribute::Flagged => Some(MailboxRole::Flagged),
        _ => None,
    })
}

/// Keeps each role on one mailbox: the one the server declares (SPECIAL-USE) over a name guess,
/// then the shallowest, so a stray `INBOX.INBOX.Sent` listed first cannot take Sent from `INBOX.Sent`.
fn keep_one_mailbox_per_role(mailboxes: &mut [RemoteMailbox], declared: &[bool]) {
    let mut best: std::collections::HashMap<MailboxRole, usize> = Default::default();
    for (index, mailbox) in mailboxes.iter().enumerate() {
        let Some(role) = mailbox.role else { continue };
        let rank = |position: usize| (!declared[position], mailboxes[position].depth);
        if best
            .get(&role)
            .is_none_or(|&current| rank(index) < rank(current))
        {
            best.insert(role, index);
        }
    }
    for (index, mailbox) in mailboxes.iter_mut().enumerate() {
        if mailbox
            .role
            .is_some_and(|role| best.get(&role) != Some(&index))
        {
            mailbox.role = None;
        }
    }
}

fn role_of(remote_name: &str, attributes: &[NameAttribute]) -> Option<MailboxRole> {
    if let Some(role) = declared_role(attributes) {
        return Some(role);
    }
    if remote_name.eq_ignore_ascii_case("INBOX") {
        return Some(MailboxRole::Inbox);
    }
    let leaf = remote_name.rsplit(['/', '.']).next().unwrap_or(remote_name);
    let decoded = utf7_imap::decode_utf7_imap(leaf.to_owned()).to_lowercase();
    match decoded.as_str() {
        "sent"
        | "sent items"
        | "sent messages"
        | "sent mail"
        | "envoyés"
        | "éléments envoyés"
        | "messages envoyés" => Some(MailboxRole::Sent),
        "drafts" | "draft" | "brouillons" => Some(MailboxRole::Drafts),
        "trash"
        | "deleted items"
        | "deleted messages"
        | "bin"
        | "corbeille"
        | "éléments supprimés" => Some(MailboxRole::Trash),
        "junk" | "spam" | "junk e-mail" | "courrier indésirable" | "indésirables" => {
            Some(MailboxRole::Junk)
        }
        "archive" | "archives" => Some(MailboxRole::Archive),
        _ => None,
    }
}

impl ImapConnection {
    pub async fn list_mailboxes(&mut self) -> Result<Vec<RemoteMailbox>> {
        let names: Vec<_> = timed(async {
            self.session
                .list(Some(""), Some("*"))
                .await?
                .try_collect()
                .await
        })
        .await?;
        let listed: Vec<_> = names
            .iter()
            .filter(|name| {
                !name.attributes().iter().any(|attribute| {
                    matches!(attribute, NameAttribute::Extension(value) if value.eq_ignore_ascii_case("\\NonExistent"))
                })
            })
            .collect();
        let declared: Vec<bool> = listed
            .iter()
            .map(|name| declared_role(name.attributes()).is_some())
            .collect();
        let mut mailboxes: Vec<RemoteMailbox> = listed
            .into_iter()
            .map(|name| {
                let remote_name = name.name().to_owned();
                let delimiter = name.delimiter().unwrap_or("/");
                let segments: Vec<&str> = remote_name.split(delimiter).collect();
                RemoteMailbox {
                    name: utf7_imap::decode_utf7_imap(
                        segments.last().copied().unwrap_or_default().to_owned(),
                    ),
                    depth: segments.len().saturating_sub(1) as u32,
                    role: role_of(&remote_name, name.attributes()),
                    selectable: !name
                        .attributes()
                        .iter()
                        .any(|attribute| matches!(attribute, NameAttribute::NoSelect)),
                    remote_name,
                }
            })
            .collect();
        keep_one_mailbox_per_role(&mut mailboxes, &declared);
        Ok(mailboxes)
    }

    pub async fn status(&mut self, remote_name: &str) -> Result<MailboxStatus> {
        let items = if self.capabilities.condstore {
            "(MESSAGES UNSEEN UIDNEXT UIDVALIDITY HIGHESTMODSEQ)"
        } else {
            "(MESSAGES UNSEEN UIDNEXT UIDVALIDITY)"
        };
        let selected = self.selected.as_deref() == Some(remote_name);
        let mailbox = status_complete(&mut self.session, remote_name, items, selected).await?;
        Ok(MailboxStatus {
            messages: mailbox.exists,
            unseen: mailbox.unseen.unwrap_or_default(),
            uid_next: mailbox.uid_next,
            uid_validity: mailbox.uid_validity,
            highest_modseq: mailbox.highest_modseq,
        })
    }

    pub async fn select(&mut self, remote_name: &str) -> Result<MailboxStatus> {
        let mailbox =
            select_complete(&mut self.session, remote_name, self.capabilities.condstore).await?;
        self.selected = Some(remote_name.to_owned());
        Ok(MailboxStatus {
            messages: mailbox.exists,
            unseen: mailbox.unseen.unwrap_or_default(),
            uid_next: mailbox.uid_next,
            uid_validity: mailbox.uid_validity,
            highest_modseq: mailbox.highest_modseq,
        })
    }

    pub async fn ensure_selected(&mut self, remote_name: &str) -> Result<()> {
        if self.selected.as_deref() != Some(remote_name) {
            self.select(remote_name).await?;
        }
        Ok(())
    }

    /// Whether the connection still answers, within a few seconds.
    pub async fn noop(&mut self) -> Result<()> {
        timed_within(NOOP_TIMEOUT, self.session.noop()).await
    }

    /// The INTERNALDATE of the message at `sequence` in the selected mailbox.
    pub async fn internal_date(&mut self, sequence: u32) -> Result<Option<i64>> {
        let fetches: Vec<Fetch> = timed(async {
            self.session
                .fetch(sequence.to_string(), "(INTERNALDATE)")
                .await?
                .try_collect()
                .await
        })
        .await?;
        Ok(fetches
            .iter()
            .find_map(|fetch| fetch.internal_date())
            .map(|date| date.timestamp_millis()))
    }

    pub async fn search_message_id(&mut self, message_id: &str) -> Result<Vec<u32>> {
        let quoted = message_id.replace('\\', "\\\\").replace('"', "\\\"");
        let uids = search_complete(
            &mut self.session,
            format!("HEADER Message-ID \"<{quoted}>\""),
        )
        .await?;
        Ok(uids.into_iter().collect())
    }

    pub async fn search_since(&mut self, since_millis: i64) -> Result<Vec<u32>> {
        let date = chrono::DateTime::from_timestamp_millis(since_millis)
            .unwrap_or_default()
            .format("%d-%b-%Y");
        let uids = search_complete(&mut self.session, format!("SINCE {date}")).await?;
        Ok(uids.into_iter().collect())
    }

    pub async fn fetch_summaries(&mut self, uids: &[u32]) -> Result<Vec<FetchedSummary>> {
        let hosts_without_partial_fetch = || {
            HOSTS_WITHOUT_PARTIAL_FETCH
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
        };
        let partial_fetch = !hosts_without_partial_fetch().contains(&self.host);
        let preview = if partial_fetch {
            format!(" BODY.PEEK[TEXT]<0.{PREVIEW_BYTES}>")
        } else {
            String::new()
        };
        let query = format!(
            "(UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS ({SUMMARY_HEADER_FIELDS})]{preview})"
        );
        let set = uid_set(uids);
        let fetches: Vec<Fetch> = match timed(async {
            self.session
                .uid_fetch(&set, &query)
                .await?
                .try_collect()
                .await
        })
        .await
        {
            Err(Error::Network(message)) if partial_fetch && message.contains("during parsing") => {
                hosts_without_partial_fetch().insert(self.host.clone());
                return Err(Error::Network(message));
            }
            result => result?,
        };
        let mut summaries: Vec<FetchedSummary> = fetches
            .iter()
            .filter_map(|fetch| {
                Some(FetchedSummary {
                    uid: fetch.uid?,
                    flags: flags_of(fetch),
                    internal_date: fetch.internal_date().map(|date| date.timestamp_millis()),
                    size: fetch.size.unwrap_or_default(),
                    header: fetch.header().unwrap_or_default().to_vec(),
                    text: fetch.text().unwrap_or_default().to_vec(),
                })
            })
            .collect();
        if !partial_fetch {
            self.fetch_whole_texts(&mut summaries).await?;
        }
        Ok(summaries)
    }

    async fn fetch_whole_texts(&mut self, summaries: &mut [FetchedSummary]) -> Result<()> {
        let small: Vec<u32> = summaries
            .iter()
            .filter(|summary| summary.size <= WHOLE_TEXT_PREVIEW_MAX_SIZE)
            .map(|summary| summary.uid)
            .collect();
        if small.is_empty() {
            return Ok(());
        }
        let set = uid_set(&small);
        let fetches: Vec<Fetch> = timed(async {
            self.session
                .uid_fetch(&set, "(UID BODY.PEEK[TEXT])")
                .await?
                .try_collect()
                .await
        })
        .await?;
        let mut texts: std::collections::HashMap<u32, Vec<u8>> = fetches
            .iter()
            .filter_map(|fetch| Some((fetch.uid?, fetch.text()?.to_vec())))
            .collect();
        for summary in summaries {
            if let Some(text) = texts.remove(&summary.uid) {
                summary.text = text;
            }
        }
        Ok(())
    }

    pub async fn fetch_flags(
        &mut self,
        uids: &str,
        changed_since: Option<u64>,
    ) -> Result<Vec<FlagUpdate>> {
        let query = match changed_since {
            Some(modseq) => format!("(UID FLAGS) (CHANGEDSINCE {modseq})"),
            None => "(UID FLAGS)".to_owned(),
        };
        let fetches: Vec<Fetch> = timed(async {
            self.session
                .uid_fetch(uids, &query)
                .await?
                .try_collect()
                .await
        })
        .await?;
        Ok(fetches
            .iter()
            .filter_map(|fetch| {
                Some(FlagUpdate {
                    uid: fetch.uid?,
                    flags: flags_of(fetch),
                })
            })
            .collect())
    }

    pub async fn fetch_raw(&mut self, uid: u32) -> Result<Vec<u8>> {
        let fetches: Vec<Fetch> = timed(async {
            self.session
                .uid_fetch(uid.to_string(), "(UID BODY.PEEK[])")
                .await?
                .try_collect()
                .await
        })
        .await?;
        fetches
            .iter()
            .find_map(|fetch| fetch.body().map(<[u8]>::to_vec))
            .ok_or(Error::NotFound)
    }

    pub async fn store_flags(&mut self, uids: &[u32], add: bool, flags: &[&str]) -> Result<()> {
        let command = format!(
            "{}FLAGS.SILENT ({})",
            if add { "+" } else { "-" },
            flags.join(" ")
        );
        let set = uid_set(uids);
        timed(async {
            self.session
                .uid_store(&set, &command)
                .await?
                .try_collect::<Vec<_>>()
                .await
        })
        .await?;
        Ok(())
    }

    pub async fn move_messages(&mut self, uids: &[u32], target: &str) -> Result<()> {
        let set = uid_set(uids);
        if self.capabilities.move_command {
            return timed(self.session.uid_mv(&set, target)).await;
        }
        timed(self.session.uid_copy(&set, target)).await?;
        self.delete_messages(uids).await
    }

    pub async fn delete_messages(&mut self, uids: &[u32]) -> Result<()> {
        self.store_flags(uids, true, &["\\Deleted"]).await?;
        let set = uid_set(uids);
        if self.capabilities.uidplus {
            timed(async {
                self.session
                    .uid_expunge(&set)
                    .await?
                    .try_collect::<Vec<_>>()
                    .await
            })
            .await?;
        } else {
            timed(async { self.session.expunge().await?.try_collect::<Vec<_>>().await }).await?;
        }
        Ok(())
    }

    pub async fn create_mailbox(&mut self, remote_name: &str) -> Result<()> {
        timed(self.session.create(remote_name)).await
    }

    pub async fn append(&mut self, remote_name: &str, raw: &[u8]) -> Result<()> {
        timed_within(
            transfer_timeout(raw.len()),
            append_seen(&mut self.session, remote_name, raw),
        )
        .await
    }

    pub async fn wait_for_changes(
        mut self,
        remote_name: &str,
        timeout: Duration,
    ) -> Result<(ImapConnection, bool)> {
        self.ensure_selected(remote_name).await?;
        let ImapConnection {
            session,
            host,
            capabilities,
            selected,
        } = self;
        let mut idle = session.idle();
        timed(idle.init()).await?;
        let (wait, _stop) = idle.wait_with_timeout(timeout);
        let changed = matches!(wait.await.map_err(map_error)?, IdleResponse::NewData(_));
        let session = timed(idle.done()).await?;
        Ok((
            ImapConnection {
                session,
                host,
                capabilities,
                selected,
            },
            changed,
        ))
    }

    pub async fn logout(mut self) {
        let _ = tokio::time::timeout(Duration::from_secs(5), self.session.logout()).await;
    }
}

/// async-imap ends SELECT, STATUS and SEARCH replies at the end of the stream without an error, so
/// a connection the server closed half-way reads as an empty mailbox: synced as is, that empties it
/// on the phone. Every complete SELECT, and the STATUS we send, carries UIDVALIDITY.
fn complete(mailbox: async_imap::types::Mailbox) -> Result<async_imap::types::Mailbox> {
    match mailbox.uid_validity {
        Some(_) => Ok(mailbox),
        None => Err(Error::Network("connection lost".into())),
    }
}

async fn select_complete<T>(
    session: &mut async_imap::Session<T>,
    remote_name: &str,
    condstore: bool,
) -> Result<async_imap::types::Mailbox>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let mailbox = if condstore {
        timed(session.select_condstore(remote_name)).await?
    } else {
        timed(session.select(remote_name)).await?
    };
    complete(mailbox)
}

/// Dovecot answers STATUS on the selected mailbox from the session's own view, which only takes
/// in mail delivered since on a NOOP: without one, a new message stays unseen until the
/// connection idles long enough to be checked.
async fn status_complete<T>(
    session: &mut async_imap::Session<T>,
    remote_name: &str,
    items: &str,
    selected: bool,
) -> Result<async_imap::types::Mailbox>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if selected {
        timed_within(NOOP_TIMEOUT, session.noop()).await?;
    }
    complete(timed(session.status(remote_name, items)).await?)
}

/// UID SEARCH, where an empty result is confirmed with a NOOP: a closed connection answers
/// "nothing found" too (see [`complete`]), and NOOP does fail on one.
async fn search_complete<T>(
    session: &mut async_imap::Session<T>,
    query: String,
) -> Result<std::collections::HashSet<u32>>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let uids = timed(session.uid_search(query)).await?;
    if uids.is_empty() {
        timed_within(NOOP_TIMEOUT, session.noop()).await?;
    }
    Ok(uids)
}

/// APPEND as async-imap does it, except that untagged responses arriving before the continuation
/// (an EXISTS for a message just delivered to the selected mailbox) are skipped instead of failing.
async fn append_seen<T>(
    session: &mut async_imap::Session<T>,
    remote_name: &str,
    raw: &[u8],
) -> std::result::Result<(), async_imap::error::Error>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    use async_imap::error::Error as ImapError;
    use async_imap::imap_proto::{Response, Status};

    let mailbox = format!(
        "\"{}\"",
        remote_name.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let tag = session
        .run_command(format!("APPEND {mailbox} (\\Seen) {{{}}}", raw.len()))
        .await?;
    let mut literal_sent = false;
    loop {
        let response = session
            .read_response()
            .await?
            .ok_or(ImapError::ConnectionLost)?;
        match response.parsed() {
            Response::Continue { .. } if !literal_sent => {
                let stream = session.get_mut();
                stream.write_all(raw).await?;
                stream.write_all(b"\r\n").await?;
                stream.flush().await?;
                literal_sent = true;
            }
            Response::Done {
                tag: done,
                status,
                outcome,
            } if *done == tag => {
                let information = outcome
                    .information
                    .as_deref()
                    .unwrap_or_default()
                    .to_owned();
                return match status {
                    Status::Ok => Ok(()),
                    Status::No => Err(ImapError::No(information)),
                    _ => Err(ImapError::Bad(information)),
                };
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_set_collapses_consecutive_uids() {
        assert_eq!(uid_set(&[7, 1, 2, 3, 5, 9, 8]), "1:3,5,7:9");
    }

    #[test]
    fn roles_fall_back_to_localized_names() {
        assert_eq!(role_of("INBOX", &[]), Some(MailboxRole::Inbox));
        assert_eq!(role_of("INBOX.Envoy&AOk-s", &[]), Some(MailboxRole::Sent));
        assert_eq!(
            role_of("[Gmail]/Tous les messages", &[NameAttribute::All]),
            Some(MailboxRole::All)
        );
        assert_eq!(role_of("Projets", &[]), None);
    }

    #[test]
    fn declared_and_shallow_mailboxes_win_a_role() {
        let mailbox = |remote_name: &str, depth| RemoteMailbox {
            remote_name: remote_name.into(),
            name: remote_name.into(),
            depth,
            role: role_of(remote_name, &[]),
            selectable: true,
        };
        let mut mailboxes = vec![
            mailbox("INBOX", 0),
            mailbox("INBOX.INBOX.Sent", 2),
            mailbox("INBOX.INBOX.Trash", 2),
            mailbox("INBOX.Sent Messages", 1),
            mailbox("INBOX.Trash", 1),
            mailbox("INBOX.Deleted Messages", 1),
        ];
        mailboxes[5].role = Some(MailboxRole::Trash);
        keep_one_mailbox_per_role(&mut mailboxes, &[false, false, false, false, false, true]);
        let roles: Vec<_> = mailboxes.iter().map(|mailbox| mailbox.role).collect();
        assert_eq!(
            roles,
            vec![
                Some(MailboxRole::Inbox),
                None,
                None,
                Some(MailboxRole::Sent),
                None,
                Some(MailboxRole::Trash),
            ]
        );
    }

    #[test]
    fn large_appends_get_time_for_a_slow_uplink() {
        assert_eq!(transfer_timeout(0), NETWORK_TIMEOUT);
        assert!(transfer_timeout(34_000_000) >= Duration::from_secs(17 * 60));
    }

    /// A fake server that logs in, then answers the next command with `reply` and hangs up when
    /// `hang_up` (as a server closing an idle connection does), or keeps answering NOOPs.
    async fn scripted_session(
        reply: &'static str,
        hang_up: bool,
    ) -> async_imap::Session<tokio::io::DuplexStream> {
        use tokio::io::{AsyncBufReadExt, BufReader};

        let (client, server) = tokio::io::duplex(4096);
        tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(server);
            let mut read = BufReader::new(read);
            let mut line = String::new();
            let mut answered = false;
            while read.read_line(&mut line).await.unwrap_or(0) > 0 {
                let tag = line.split(' ').next().unwrap_or_default().to_owned();
                let answer = if line.contains("LOGIN") {
                    format!("{tag} OK LOGIN completed\r\n")
                } else if line.contains("NOOP") {
                    format!("{tag} OK NOOP completed\r\n")
                } else if !answered {
                    answered = true;
                    reply.replace("{tag}", &tag)
                } else {
                    format!("{tag} BAD unexpected\r\n")
                };
                write.write_all(answer.as_bytes()).await.unwrap();
                if answered && hang_up {
                    return;
                }
                line.clear();
            }
        });
        async_imap::Client::new(client)
            .login("alice", "secret")
            .await
            .map_err(|(error, _)| error)
            .unwrap()
    }

    #[tokio::test]
    async fn a_select_cut_off_by_the_server_is_a_lost_connection_not_an_empty_mailbox() {
        let mut session = scripted_session("* 147 EXISTS\r\n", true).await;
        let result = select_complete(&mut session, "INBOX", false).await;
        assert!(matches!(result, Err(Error::Network(_))), "{result:?}");
    }

    #[tokio::test]
    async fn a_complete_select_reports_its_uidvalidity() {
        let reply = "* 147 EXISTS\r\n* OK [UIDVALIDITY 1794294172] UIDs valid\r\n* OK [UIDNEXT 148] next\r\n{tag} OK [READ-WRITE] SELECT completed\r\n";
        let mut session = scripted_session(reply, false).await;
        let mailbox = select_complete(&mut session, "INBOX", false).await.unwrap();
        assert_eq!(
            (mailbox.exists, mailbox.uid_validity),
            (147, Some(1_794_294_172))
        );
    }

    #[tokio::test]
    async fn the_selected_mailbox_status_includes_mail_delivered_since_it_was_selected() {
        use tokio::io::{AsyncBufReadExt, BufReader};

        // Like Dovecot: STATUS on the selected mailbox answers from the session's view, which
        // only takes in the message delivered meanwhile on the next NOOP.
        let (client, server) = tokio::io::duplex(4096);
        tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(server);
            let mut read = BufReader::new(read);
            let mut line = String::new();
            let mut uid_next = 16;
            while read.read_line(&mut line).await.unwrap_or(0) > 0 {
                let tag = line.split(' ').next().unwrap_or_default().to_owned();
                let answer = if line.contains("NOOP") {
                    uid_next = 17;
                    format!("* 16 EXISTS\r\n{tag} OK NOOP completed\r\n")
                } else if line.contains("STATUS") {
                    format!(
                        "* STATUS INBOX (MESSAGES {} UIDNEXT {uid_next} UIDVALIDITY 1)\r\n{tag} OK STATUS completed\r\n",
                        uid_next - 1
                    )
                } else {
                    format!("{tag} OK completed\r\n")
                };
                write.write_all(answer.as_bytes()).await.unwrap();
                line.clear();
            }
        });
        let mut session = async_imap::Client::new(client)
            .login("alice", "secret")
            .await
            .map_err(|(error, _)| error)
            .unwrap();
        let mailbox = status_complete(
            &mut session,
            "INBOX",
            "(MESSAGES UIDNEXT UIDVALIDITY)",
            true,
        )
        .await
        .unwrap();
        assert_eq!((mailbox.exists, mailbox.uid_next), (16, Some(17)));
    }

    #[tokio::test]
    async fn a_search_cut_off_by_the_server_is_a_lost_connection_not_an_empty_result() {
        let mut session = scripted_session("", true).await;
        let result = search_complete(&mut session, "SINCE 01-Oct-2026".into()).await;
        assert!(matches!(result, Err(Error::Network(_))), "{result:?}");
    }

    #[tokio::test]
    async fn a_search_that_found_nothing_stays_empty() {
        let mut session =
            scripted_session("* SEARCH\r\n{tag} OK SEARCH completed\r\n", false).await;
        let uids = search_complete(&mut session, "SINCE 01-Oct-2026".into())
            .await
            .unwrap();
        assert!(uids.is_empty());
    }

    #[tokio::test]
    async fn append_waits_past_untagged_responses_for_the_continuation() {
        use tokio::io::{AsyncBufReadExt, BufReader};

        let (client, server) = tokio::io::duplex(4096);
        let server = tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(server);
            let mut read = BufReader::new(read);
            let mut line = String::new();
            read.read_line(&mut line).await.unwrap();
            let tag = line.split(' ').next().unwrap().to_owned();
            write
                .write_all(format!("{tag} OK LOGIN completed\r\n").as_bytes())
                .await
                .unwrap();
            line.clear();
            read.read_line(&mut line).await.unwrap();
            let tag = line.split(' ').next().unwrap().to_owned();
            assert!(line.ends_with("APPEND \"Sent\" (\\Seen) {5}\r\n"), "{line}");
            write
                .write_all(b"* 146 EXISTS\r\n* 1 RECENT\r\n+ Ready\r\n")
                .await
                .unwrap();
            let mut literal = [0u8; 7];
            read.read_exact(&mut literal).await.unwrap();
            write
                .write_all(format!("{tag} OK APPEND completed\r\n").as_bytes())
                .await
                .unwrap();
            literal
        });
        let mut session = async_imap::Client::new(client)
            .login("alice", "secret")
            .await
            .map_err(|(error, _)| error)
            .unwrap();

        append_seen(&mut session, "Sent", b"hello").await.unwrap();

        assert_eq!(&server.await.unwrap(), b"hello\r\n");
    }
}
