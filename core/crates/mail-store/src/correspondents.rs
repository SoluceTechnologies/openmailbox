use mail_model::{Address, Result};
use rusqlite::{Transaction, params};

use crate::{StorageResult, Store};

const UPSERT_SENT: &str = "INSERT INTO correspondent (email, name, sent, last_seen_at) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT (email) DO UPDATE SET sent = sent + 1, last_seen_at = max(last_seen_at, excluded.last_seen_at),
       name = coalesce(excluded.name, name)";

impl Store {
    pub fn record_sent(&self, recipients: &[Address], at: i64) -> Result<()> {
        self.write(|transaction| {
            let mut upsert = transaction.prepare_cached(UPSERT_SENT).storage()?;
            for recipient in recipients {
                upsert
                    .execute(params![recipient.email, recipient.name, at])
                    .storage()?;
            }
            Ok(())
        })
    }

    pub fn suggest_addresses(&self, query: &str, limit: u32) -> Result<Vec<Address>> {
        let escaped = query
            .trim()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        if escaped.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(
                "SELECT email, name FROM correspondent
                 WHERE email NOT IN (SELECT email FROM account)
                   AND (email LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' OR name LIKE ?2 ESCAPE '\\')
                 ORDER BY sent * 3 + received DESC, last_seen_at DESC
                 LIMIT ?3",
            )
            .storage()?;
        statement
            .query_map(
                params![format!("{escaped}%"), format!("% {escaped}%"), limit],
                |row| {
                    Ok(Address {
                        email: row.get(0)?,
                        name: row.get(1)?,
                    })
                },
            )
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }
}

pub(crate) fn record_received(
    transaction: &Transaction,
    account_email: &str,
    senders: &[Address],
    at: i64,
) -> Result<()> {
    let mut upsert = transaction
        .prepare_cached(
            "INSERT INTO correspondent (email, name, received, last_seen_at) VALUES (?1, ?2, 1, ?3)
             ON CONFLICT (email) DO UPDATE SET received = received + 1,
               last_seen_at = max(last_seen_at, excluded.last_seen_at), name = coalesce(excluded.name, name)",
        )
        .storage()?;
    for sender in senders
        .iter()
        .filter(|sender| !sender.email.eq_ignore_ascii_case(account_email))
    {
        upsert
            .execute(params![sender.email, sender.name, at])
            .storage()?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../../tests/mail_store/correspondents.rs"]
mod tests;
