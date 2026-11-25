use mail_model::{Account, Authentication, Error, Result, Security, ServerConfig, ServerEndpoint};
use rusqlite::{OptionalExtension, Row, params};

use crate::{StorageResult, Store};

const ACCOUNT_COLOR_COUNT: u32 = 12;

const ACCOUNT_COLUMNS: &str = "id, email, display_name, username, imap_host, imap_port, imap_security, \
     smtp_host, smtp_port, smtp_security, color, created_at, authentication, oauth_server, smtp_username";

fn account_from_row(row: &Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        username: row.get(3)?,
        smtp_username: row.get(14)?,
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
        authentication: Authentication::parse(&row.get::<_, String>(12)?),
        oauth_server: row
            .get::<_, Option<String>>(13)?
            .and_then(|json| serde_json::from_str(&json).ok()),
    })
}

impl Store {
    pub fn notified_until(&self, account_id: &str) -> Result<(i64, i64)> {
        self.read()
            .query_row(
                "SELECT notified_until, notified_email_id FROM account WHERE id = ?1",
                [account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn set_notified_until(&self, account_id: &str, at: i64) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET notified_until = max(notified_until, ?2),
                       notified_email_id = max(notified_email_id, coalesce((SELECT max(id) FROM email WHERE account_id = ?1), 0))
                     WHERE id = ?1",
                    params![account_id, at],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn advance_notified_until(&self, account_id: &str) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET
                       notified_until = max(notified_until, coalesce((
                         SELECT max(e.received_at) FROM email e
                         JOIN email_mailbox em ON em.email_id = e.id
                         JOIN mailbox m ON m.id = em.mailbox_id
                         WHERE m.account_id = ?1 AND m.role = 'inbox'), 0)),
                       notified_email_id = max(notified_email_id, coalesce((
                         SELECT max(e.id) FROM email e
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
                    &format!("INSERT INTO account ({ACCOUNT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"),
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
                        account.authentication.as_str(),
                        account
                            .oauth_server
                            .as_ref()
                            .and_then(|server| serde_json::to_string(server).ok()),
                        account.smtp_username,
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

    pub fn has_account_for(&self, email: &str) -> Result<bool> {
        self.read()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM account WHERE lower(email) = lower(trim(?1)))",
                [email],
                |row| row.get(0),
            )
            .storage()
    }

    pub fn next_account_color(&self) -> Result<u32> {
        let connection = self.read();
        connection
            .query_row(
                "WITH RECURSIVE palette(color) AS (
                   SELECT 0 UNION ALL SELECT color + 1 FROM palette WHERE color + 1 < ?1
                 )
                 SELECT palette.color FROM palette
                 LEFT JOIN account ON account.color % ?1 = palette.color
                 GROUP BY palette.color
                 ORDER BY COUNT(account.id), random()
                 LIMIT 1",
                [ACCOUNT_COLOR_COUNT],
                |row| row.get(0),
            )
            .storage()
    }

    pub fn set_account_color(&self, account_id: &str, color: u32) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET color = ?2 WHERE id = ?1",
                    params![account_id, color % ACCOUNT_COLOR_COUNT],
                )
                .storage()?;
            Ok(())
        })
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

    pub fn update_servers(&self, account_id: &str, servers: &ServerConfig) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE account SET username = ?2, smtp_username = ?3,
                       imap_host = ?4, imap_port = ?5, imap_security = ?6,
                       smtp_host = ?7, smtp_port = ?8, smtp_security = ?9
                     WHERE id = ?1",
                    params![
                        account_id,
                        servers.username,
                        servers.smtp_username,
                        servers.imap.host,
                        servers.imap.port,
                        servers.imap.security.as_str(),
                        servers.smtp.host,
                        servers.smtp.port,
                        servers.smtp.security.as_str(),
                    ],
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

#[cfg(test)]
#[path = "../../../tests/mail_store/accounts.rs"]
mod tests;
