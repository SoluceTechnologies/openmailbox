mod accounts;
mod emails;
mod mailboxes;
mod operations;
mod threads;

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use mail_model::{Address, EmailSummary, Error, Result};
use rusqlite::{Connection, Row, Transaction};

pub use emails::{MessageLocation, ReplyContext};
pub use mailboxes::MailboxSyncState;
pub use operations::{OperationRewrite, PendingOperation};

const MIGRATIONS: &[&str] = &[include_str!("schema.sql")];

pub struct Store {
    writer: Mutex<Connection>,
    reader: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Store> {
        let writer = open_connection(path)?;
        migrate(&writer)?;
        let reader = open_connection(path)?;
        Ok(Store {
            writer: Mutex::new(writer),
            reader: Mutex::new(reader),
        })
    }

    fn read(&self) -> MutexGuard<'_, Connection> {
        self.reader
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn write<T>(&self, operation: impl FnOnce(&Transaction) -> Result<T>) -> Result<T> {
        let mut connection = self
            .writer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let transaction = connection.transaction().storage()?;
        let result = operation(&transaction)?;
        transaction.commit().storage()?;
        Ok(result)
    }
}

fn open_connection(path: &Path) -> Result<Connection> {
    let connection = Connection::open(path).storage()?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA busy_timeout = 5000;",
        )
        .storage()?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<()> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .storage()?;
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        connection.execute_batch(migration).storage()?;
        connection
            .pragma_update(None, "user_version", index as i64 + 1)
            .storage()?;
    }
    Ok(())
}

pub(crate) trait StorageResult<T> {
    fn storage(self) -> Result<T>;
}

impl<T> StorageResult<T> for rusqlite::Result<T> {
    fn storage(self) -> Result<T> {
        self.map_err(|error| Error::Storage(error.to_string()))
    }
}

pub(crate) const EMAIL_COLUMNS: &str = "e.id, e.account_id, e.thread_id, e.subject, e.from_json, e.to_json, \
     e.cc_json, e.preview, e.received_at, e.is_seen, e.is_flagged, e.is_answered, e.has_attachment";

pub(crate) fn email_from_row(row: &Row, offset: usize) -> rusqlite::Result<EmailSummary> {
    Ok(EmailSummary {
        id: row.get(offset)?,
        account_id: row.get(offset + 1)?,
        thread_id: row.get(offset + 2)?,
        subject: row.get(offset + 3)?,
        from: addresses_from_json(&row.get::<_, String>(offset + 4)?),
        to: addresses_from_json(&row.get::<_, String>(offset + 5)?),
        cc: addresses_from_json(&row.get::<_, String>(offset + 6)?),
        preview: row.get(offset + 7)?,
        received_at: row.get(offset + 8)?,
        is_seen: row.get(offset + 9)?,
        is_flagged: row.get(offset + 10)?,
        is_answered: row.get(offset + 11)?,
        has_attachment: row.get(offset + 12)?,
    })
}

pub(crate) fn addresses_to_json(addresses: &[Address]) -> String {
    serde_json::to_string(addresses).unwrap_or_else(|_| "[]".to_owned())
}

pub(crate) fn addresses_from_json(json: &str) -> Vec<Address> {
    serde_json::from_str(json).unwrap_or_default()
}

pub(crate) fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use mail_model::{Account, Security, ServerEndpoint};

    pub fn store() -> (Store, std::path::PathBuf) {
        let directory = std::env::temp_dir().join(format!("mail-store-test-{}", rand_suffix()));
        std::fs::create_dir_all(&directory).unwrap();
        let store = Store::open(&directory.join("mail.db")).unwrap();
        (store, directory)
    }

    fn rand_suffix() -> String {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        format!(
            "{}-{}-{}",
            std::process::id(),
            mail_model::now_millis(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        )
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
