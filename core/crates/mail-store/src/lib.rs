mod accounts;
mod categories;
mod correspondents;
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

const MIGRATIONS: &[&str] = &[
    include_str!("migrations/0001_initial.sql"),
    include_str!("migrations/0002_search_by_date.sql"),
    include_str!("migrations/0003_unsubscribe.sql"),
    include_str!("migrations/0004_correspondents.sql"),
    include_str!("migrations/0005_notified_until.sql"),
    include_str!("migrations/0006_categories.sql"),
    include_str!("migrations/0007_unknown_signals.sql"),
    include_str!("migrations/0008_store_settings.sql"),
    include_str!("migrations/0009_stored_signals.sql"),
    include_str!("migrations/0010_render_html_again.sql"),
    include_str!("migrations/0011_authentication.sql"),
    include_str!("migrations/0012_oauth_server.sql"),
    include_str!("migrations/0013_original_sender.sql"),
    include_str!("migrations/0014_alias_senders.sql"),
    include_str!("migrations/0015_smtp_username.sql"),
    include_str!("migrations/0016_body_calendar.sql"),
    include_str!("migrations/0017_body_bcc.sql"),
];

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
    migrate_with(connection, MIGRATIONS)?;
    add_notified_email_id(connection)?;
    categories::classify_again(connection)?;
    emails::refetch_undecoded(connection)
}

fn add_notified_email_id(connection: &Connection) -> Result<()> {
    let present: bool = connection
        .query_row(
            "SELECT count(*) > 0 FROM pragma_table_info('account') WHERE name = 'notified_email_id'",
            [],
            |row| row.get(0),
        )
        .storage()?;
    if !present {
        connection
            .execute_batch(
                "ALTER TABLE account ADD COLUMN notified_email_id INTEGER NOT NULL DEFAULT 0",
            )
            .storage()?;
    }
    Ok(())
}

fn migrate_with(connection: &Connection, migrations: &[&str]) -> Result<()> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .storage()?;
    for (index, migration) in migrations.iter().enumerate().skip(version as usize) {
        let transaction = connection.unchecked_transaction().storage()?;
        transaction.execute_batch(migration).storage()?;
        transaction
            .pragma_update(None, "user_version", index as i64 + 1)
            .storage()?;
        transaction.commit().storage()?;
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
     e.cc_json, e.preview, e.received_at, e.is_seen, e.is_flagged, e.is_answered, e.has_attachment, \
     e.original_sender";

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
        original_sender: row.get(offset + 13)?,
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
#[path = "../../../tests/mail_store/test_support.rs"]
pub(crate) mod test_support;

#[cfg(test)]
#[path = "../../../tests/mail_store/migration_tests.rs"]
mod migration_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/cached_html_tests.rs"]
mod cached_html_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/cached_invitation_tests.rs"]
mod cached_invitation_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/search_text_tests.rs"]
mod search_text_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/undecoded_tests.rs"]
mod undecoded_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/interrupted_migration_tests.rs"]
mod interrupted_migration_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/early_notified_until_tests.rs"]
mod early_notified_until_tests;

#[cfg(test)]
#[path = "../../../tests/mail_store/correspondent_migration_tests.rs"]
mod correspondent_migration_tests;
