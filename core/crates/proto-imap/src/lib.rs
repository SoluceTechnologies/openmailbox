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
const SUMMARY_HEADER_FIELDS: &str = "DATE FROM TO CC REPLY-TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES \
     CONTENT-TYPE CONTENT-TRANSFER-ENCODING MIME-VERSION";
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
    match tokio::time::timeout(NETWORK_TIMEOUT, future).await {
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

fn role_of(remote_name: &str, attributes: &[NameAttribute]) -> Option<MailboxRole> {
    for attribute in attributes {
        let role = match attribute {
            NameAttribute::Sent => MailboxRole::Sent,
            NameAttribute::Drafts => MailboxRole::Drafts,
            NameAttribute::Trash => MailboxRole::Trash,
            NameAttribute::Junk => MailboxRole::Junk,
            NameAttribute::Archive => MailboxRole::Archive,
            NameAttribute::All => MailboxRole::All,
            NameAttribute::Flagged => MailboxRole::Flagged,
            _ => continue,
        };
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
        let mut mailboxes: Vec<RemoteMailbox> = names
            .iter()
            .filter(|name| {
                !name.attributes().iter().any(|attribute| {
                    matches!(attribute, NameAttribute::Extension(value) if value.eq_ignore_ascii_case("\\NonExistent"))
                })
            })
            .map(|name| {
                let remote_name = name.name().to_owned();
                let delimiter = name.delimiter().unwrap_or("/");
                let segments: Vec<&str> = remote_name.split(delimiter).collect();
                RemoteMailbox {
                    name: utf7_imap::decode_utf7_imap(segments.last().copied().unwrap_or_default().to_owned()),
                    depth: segments.len().saturating_sub(1) as u32,
                    role: role_of(&remote_name, name.attributes()),
                    selectable: !name.attributes().iter().any(|attribute| matches!(attribute, NameAttribute::NoSelect)),
                    remote_name,
                }
            })
            .collect();
        let mut claimed_roles = std::collections::HashSet::new();
        for mailbox in mailboxes.iter_mut() {
            if let Some(role) = mailbox.role
                && !claimed_roles.insert(role)
            {
                mailbox.role = None;
            }
        }
        Ok(mailboxes)
    }

    pub async fn status(&mut self, remote_name: &str) -> Result<MailboxStatus> {
        let items = if self.capabilities.condstore {
            "(MESSAGES UNSEEN UIDNEXT UIDVALIDITY HIGHESTMODSEQ)"
        } else {
            "(MESSAGES UNSEEN UIDNEXT UIDVALIDITY)"
        };
        let mailbox = timed(self.session.status(remote_name, items)).await?;
        Ok(MailboxStatus {
            messages: mailbox.exists,
            unseen: mailbox.unseen.unwrap_or_default(),
            uid_next: mailbox.uid_next,
            uid_validity: mailbox.uid_validity,
            highest_modseq: mailbox.highest_modseq,
        })
    }

    pub async fn select(&mut self, remote_name: &str) -> Result<MailboxStatus> {
        let mailbox = if self.capabilities.condstore {
            timed(self.session.select_condstore(remote_name)).await?
        } else {
            timed(self.session.select(remote_name)).await?
        };
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

    pub async fn search_since(&mut self, since_millis: i64) -> Result<Vec<u32>> {
        let date = chrono::DateTime::from_timestamp_millis(since_millis)
            .unwrap_or_default()
            .format("%d-%b-%Y");
        let uids = timed(self.session.uid_search(format!("SINCE {date}"))).await?;
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
        timed(
            self.session
                .append(remote_name, Some("(\\Seen)"), None, raw),
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
}
