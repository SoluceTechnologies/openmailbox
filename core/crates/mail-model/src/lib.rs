use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, thiserror::Error)]
pub enum Error {
    #[error("network: {0}")]
    Network(String),
    #[error("authentication failed")]
    Auth,
    #[error("server: {0}")]
    Server(String),
    #[error("storage: {0}")]
    Storage(String),
    #[error("not found")]
    NotFound,
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Security {
    Tls,
    StartTls,
}

impl Security {
    pub fn as_str(self) -> &'static str {
        match self {
            Security::Tls => "tls",
            Security::StartTls => "starttls",
        }
    }

    pub fn parse(value: &str) -> Security {
        if value == "starttls" {
            Security::StartTls
        } else {
            Security::Tls
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerEndpoint {
    pub host: String,
    pub port: u16,
    pub security: Security,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerConfig {
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
    pub username: String,
}

#[derive(Debug, Clone)]
pub struct AccountConfig {
    pub email: String,
    pub display_name: String,
    pub username: String,
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
}

#[derive(Debug, Clone)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub username: String,
    pub imap: ServerEndpoint,
    pub smtp: ServerEndpoint,
    pub color: u32,
    pub created_at: i64,
}

impl Account {
    pub fn is_gmail(&self) -> bool {
        self.imap.host.ends_with("gmail.com") || self.imap.host.ends_with("googlemail.com")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
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

impl MailboxRole {
    pub fn as_str(self) -> &'static str {
        match self {
            MailboxRole::Inbox => "inbox",
            MailboxRole::Sent => "sent",
            MailboxRole::Drafts => "drafts",
            MailboxRole::Trash => "trash",
            MailboxRole::Junk => "junk",
            MailboxRole::Archive => "archive",
            MailboxRole::All => "all",
            MailboxRole::Flagged => "flagged",
        }
    }

    pub fn parse(value: &str) -> Option<MailboxRole> {
        Some(match value {
            "inbox" => MailboxRole::Inbox,
            "sent" => MailboxRole::Sent,
            "drafts" => MailboxRole::Drafts,
            "trash" => MailboxRole::Trash,
            "junk" => MailboxRole::Junk,
            "archive" => MailboxRole::Archive,
            "all" => MailboxRole::All,
            "flagged" => MailboxRole::Flagged,
            _ => return None,
        })
    }

    pub fn is_synced_in_background(self) -> bool {
        !matches!(self, MailboxRole::All | MailboxRole::Flagged)
    }
}

#[derive(Debug, Clone)]
pub struct Mailbox {
    pub id: i64,
    pub account_id: String,
    pub remote_name: String,
    pub name: String,
    pub depth: u32,
    pub role: Option<MailboxRole>,
    pub selectable: bool,
    pub total_count: u32,
    pub unread_count: u32,
}

#[derive(Debug, Clone)]
pub struct RemoteMailbox {
    pub remote_name: String,
    pub name: String,
    pub depth: u32,
    pub role: Option<MailboxRole>,
    pub selectable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Address {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Keyword {
    Seen,
    Flagged,
    Answered,
}

impl Keyword {
    pub fn imap_flag(self) -> &'static str {
        match self {
            Keyword::Seen => "\\Seen",
            Keyword::Flagged => "\\Flagged",
            Keyword::Answered => "\\Answered",
        }
    }

    pub fn column(self) -> &'static str {
        match self {
            Keyword::Seen => "is_seen",
            Keyword::Flagged => "is_flagged",
            Keyword::Answered => "is_answered",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Flags {
    pub seen: bool,
    pub flagged: bool,
    pub answered: bool,
    pub draft: bool,
    pub deleted: bool,
}

#[derive(Debug, Clone)]
pub struct EmailSummary {
    pub id: i64,
    pub account_id: String,
    pub thread_id: i64,
    pub subject: Option<String>,
    pub from: Vec<Address>,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub preview: Option<String>,
    pub received_at: i64,
    pub is_seen: bool,
    pub is_flagged: bool,
    pub is_answered: bool,
    pub has_attachment: bool,
}

#[derive(Debug, Clone)]
pub struct ThreadSummary {
    pub thread_id: i64,
    pub mailbox_id: i64,
    pub account_id: String,
    pub latest: EmailSummary,
    pub message_count: u32,
    pub unread_count: u32,
    pub is_flagged: bool,
    pub has_attachment: bool,
    pub last_received_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreadScope {
    Unified,
    Mailbox(i64),
}

#[derive(Debug, Clone)]
pub struct ThreadPage {
    pub threads: Vec<ThreadSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub index: u32,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct RenderedBody {
    pub html: Option<String>,
    pub text: String,
    pub has_remote_content: bool,
    pub attachments: Vec<Attachment>,
}

/// Largest total size of the files attached to one outgoing message.
pub const MAX_ATTACHMENTS_BYTES: u64 = 26_214_400;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutgoingAttachment {
    pub path: String,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Debug, Clone)]
pub struct Draft {
    pub account_id: String,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub bcc: Vec<Address>,
    pub subject: String,
    pub body_text: String,
    pub in_reply_to_email_id: Option<i64>,
    pub attachments: Vec<OutgoingAttachment>,
}

#[derive(Debug, Clone)]
pub struct FetchedMessage {
    pub uid: u32,
    pub flags: Flags,
    pub internal_date: Option<i64>,
    pub size: u32,
    pub headers: ParsedHeaders,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedHeaders {
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub subject: Option<String>,
    pub from: Vec<Address>,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub reply_to: Vec<Address>,
    pub date: Option<i64>,
    pub has_attachment: bool,
    pub preview: Option<String>,
}

impl ParsedHeaders {
    pub fn thread_root(&self) -> Option<&str> {
        self.references
            .first()
            .map(String::as_str)
            .or(self.in_reply_to.as_deref())
            .or(self.message_id.as_deref())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncErrorKind {
    Network,
    Auth,
    Server,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    Idle {
        last_synced_at: Option<i64>,
    },
    Syncing,
    Failed {
        kind: SyncErrorKind,
        message: String,
    },
    Offline,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreEvent {
    MailboxesChanged {
        mailbox_ids: Vec<i64>,
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

pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
