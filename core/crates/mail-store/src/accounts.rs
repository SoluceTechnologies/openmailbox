use mail_model::{Account, Error, Result, Security, ServerEndpoint};
use rusqlite::{OptionalExtension, Row, params};

use crate::{StorageResult, Store};

const ACCOUNT_COLUMNS: &str = "id, email, display_name, username, imap_host, imap_port, imap_security, \
     smtp_host, smtp_port, smtp_security, color, created_at";

fn account_from_row(row: &Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        username: row.get(3)?,
        imap: ServerEndpoint {
            host: row.get(4)?,
            port: row.get(5)?,
            security: Security::parse(&row.get::<_, String>(6)?),
        },
        smtp: ServerEndpoint {
            host: row.get(7)?,
            port: row.get(8)?,
            security: Security::parse(&row.get::<_, String>(9)?),
        },
        color: row.get(10)?,
        created_at: row.get(11)?,
    })
}

impl Store {
    pub fn notified_until(&self, account_id: &str) -> Result<i64> {
        self.read()
            .query_row(
                "SELECT notified_until FROM account WHERE id = ?1",
                [account_id],
                |row| row.get(0),
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn set_notified_until(&self, account_id: &str, at: i64) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET notified_until = max(notified_until, ?2) WHERE id = ?1",
                    params![account_id, at],
                )
                .storage()?;
            Ok(())
        })
    }

    /// Moves the notification watermark past every message already in the account's inbox.
    pub fn advance_notified_until(&self, account_id: &str) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET notified_until = max(notified_until, coalesce((
                       SELECT max(e.received_at) FROM email e
                       JOIN email_mailbox em ON em.email_id = e.id
                       JOIN mailbox m ON m.id = em.mailbox_id
                       WHERE m.account_id = ?1 AND m.role = 'inbox'), 0))
                     WHERE id = ?1",
                    [account_id],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn insert_account(&self, account: &Account) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    &format!("INSERT INTO account ({ACCOUNT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"),
                    params![
                        account.id,
                        account.email,
                        account.display_name,
                        account.username,
                        account.imap.host,
                        account.imap.port,
                        account.imap.security.as_str(),
                        account.smtp.host,
                        account.smtp.port,
                        account.smtp.security.as_str(),
                        account.color,
                        account.created_at,
                    ],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn list_accounts(&self) -> Result<Vec<Account>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT {ACCOUNT_COLUMNS} FROM account ORDER BY created_at"
            ))
            .storage()?;
        statement
            .query_map([], account_from_row)
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn account(&self, account_id: &str) -> Result<Account> {
        let connection = self.read();
        connection
            .query_row(
                &format!("SELECT {ACCOUNT_COLUMNS} FROM account WHERE id = ?1"),
                [account_id],
                account_from_row,
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn next_account_color(&self) -> Result<u32> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT COALESCE(MAX(color) + 1, 0) FROM account",
                [],
                |row| row.get(0),
            )
            .storage()
    }

    pub fn rename_account(&self, account_id: &str, display_name: &str) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET display_name = ?2 WHERE id = ?1",
                    params![account_id, display_name],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn delete_account(&self, account_id: &str) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute("DELETE FROM account WHERE id = ?1", [account_id])
                .storage()?;
            Ok(())
        })
    }
}
