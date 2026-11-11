use mail_model::{Error, Mailbox, MailboxRole, RemoteMailbox, Result};
use rusqlite::{OptionalExtension, Row, params};

use crate::{StorageResult, Store};

const MAILBOX_COLUMNS: &str = "m.id, m.account_id, m.remote_name, m.name, m.depth, m.role, m.selectable, m.total_count, m.unread_count";

const ROLE_ORDER: &str = "CASE m.role WHEN 'inbox' THEN 0 WHEN 'drafts' THEN 1 WHEN 'sent' THEN 2 \
     WHEN 'archive' THEN 3 WHEN 'junk' THEN 4 WHEN 'trash' THEN 5 ELSE 6 END";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MailboxSyncState {
    pub uidvalidity: Option<u32>,
    pub uidnext: Option<u32>,
    pub highest_modseq: Option<u64>,
    pub sync_since: Option<i64>,
    pub synced_at: Option<i64>,
}

fn mailbox_from_row(row: &Row) -> rusqlite::Result<Mailbox> {
    Ok(Mailbox {
        id: row.get(0)?,
        account_id: row.get(1)?,
        remote_name: row.get(2)?,
        name: row.get(3)?,
        depth: row.get(4)?,
        role: row
            .get::<_, Option<String>>(5)?
            .as_deref()
            .and_then(MailboxRole::parse),
        selectable: row.get(6)?,
        total_count: row.get(7)?,
        unread_count: row.get(8)?,
    })
}

impl Store {
    pub fn replace_mailboxes(
        &self,
        account_id: &str,
        remote_mailboxes: &[RemoteMailbox],
    ) -> Result<()> {
        // Every account has an INBOX: a listing without one is a failed LIST, not an empty account.
        if !remote_mailboxes
            .iter()
            .any(|mailbox| mailbox.role == Some(MailboxRole::Inbox))
        {
            return Err(Error::Server("the server listed no INBOX".into()));
        }
        self.write(|transaction| {
            transaction
                .execute("CREATE TEMP TABLE IF NOT EXISTS seen_mailbox (remote_name TEXT PRIMARY KEY)", [])
                .storage()?;
            transaction.execute("DELETE FROM temp.seen_mailbox", []).storage()?;
            let mut upsert = transaction
                .prepare_cached(
                    "INSERT INTO mailbox (account_id, remote_name, name, depth, role, selectable)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT (account_id, remote_name) DO UPDATE SET
                       name = excluded.name, depth = excluded.depth,
                       role = excluded.role, selectable = excluded.selectable",
                )
                .storage()?;
            let mut remember = transaction
                .prepare_cached("INSERT OR IGNORE INTO temp.seen_mailbox (remote_name) VALUES (?1)")
                .storage()?;
            for mailbox in remote_mailboxes {
                upsert
                    .execute(params![
                        account_id,
                        mailbox.remote_name,
                        mailbox.name,
                        mailbox.depth,
                        mailbox.role.map(MailboxRole::as_str),
                        mailbox.selectable,
                    ])
                    .storage()?;
                remember.execute([&mailbox.remote_name]).storage()?;
            }
            transaction
                .execute(
                    "DELETE FROM mailbox WHERE account_id = ?1
                       AND remote_name NOT IN (SELECT remote_name FROM temp.seen_mailbox)",
                    [account_id],
                )
                .storage()?;
            transaction.execute("DELETE FROM email WHERE account_id = ?1 AND id NOT IN (SELECT email_id FROM email_mailbox)", [account_id]).storage()?;
            Ok(())
        })
    }

    pub fn list_mailboxes(&self, account_id: Option<&str>) -> Result<Vec<Mailbox>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT {MAILBOX_COLUMNS} FROM mailbox m JOIN account a ON a.id = m.account_id
                 WHERE ?1 IS NULL OR m.account_id = ?1
                 ORDER BY a.created_at, {ROLE_ORDER}, m.remote_name"
            ))
            .storage()?;
        statement
            .query_map([account_id], mailbox_from_row)
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn mailbox(&self, mailbox_id: i64) -> Result<Mailbox> {
        let connection = self.read();
        connection
            .query_row(
                &format!("SELECT {MAILBOX_COLUMNS} FROM mailbox m WHERE m.id = ?1"),
                [mailbox_id],
                mailbox_from_row,
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn mailbox_by_role(&self, account_id: &str, role: MailboxRole) -> Result<Option<Mailbox>> {
        let connection = self.read();
        connection
            .query_row(
                &format!("SELECT {MAILBOX_COLUMNS} FROM mailbox m WHERE m.account_id = ?1 AND m.role = ?2 LIMIT 1"),
                params![account_id, role.as_str()],
                mailbox_from_row,
            )
            .optional()
            .storage()
    }

    pub fn mailbox_sync_state(&self, mailbox_id: i64) -> Result<MailboxSyncState> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT uidvalidity, uidnext, highest_modseq, sync_since, synced_at FROM mailbox WHERE id = ?1",
                [mailbox_id],
                |row| {
                    Ok(MailboxSyncState {
                        uidvalidity: row.get(0)?,
                        uidnext: row.get(1)?,
                        highest_modseq: row.get::<_, Option<i64>>(2)?.map(|value| value as u64),
                        sync_since: row.get(3)?,
                        synced_at: row.get(4)?,
                    })
                },
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn save_mailbox_sync_state(&self, mailbox_id: i64, state: &MailboxSyncState) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "UPDATE mailbox SET uidvalidity = ?2, uidnext = ?3, highest_modseq = ?4,
                       sync_since = ?5, synced_at = ?6 WHERE id = ?1",
                    params![
                        mailbox_id,
                        state.uidvalidity,
                        state.uidnext,
                        state.highest_modseq.map(|value| value as i64),
                        state.sync_since,
                        state.synced_at,
                    ],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn set_mailbox_counts(
        &self,
        mailbox_id: i64,
        total_count: u32,
        unread_count: u32,
    ) -> Result<bool> {
        self.write(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE mailbox SET total_count = ?2, unread_count = ?3
                     WHERE id = ?1 AND (total_count != ?2 OR unread_count != ?3)",
                    params![mailbox_id, total_count, unread_count],
                )
                .storage()?;
            Ok(changed > 0)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support;

    fn remote(name: &str, role: Option<MailboxRole>) -> RemoteMailbox {
        RemoteMailbox {
            remote_name: name.into(),
            name: name.into(),
            depth: 0,
            role,
            selectable: true,
        }
    }

    #[test]
    fn replace_mailboxes_keeps_ids_and_removes_missing_ones() {
        let (store, _directory) = test_support::store();
        store
            .insert_account(&test_support::account("alice"))
            .unwrap();
        store
            .replace_mailboxes(
                "alice",
                &[
                    remote("INBOX", Some(MailboxRole::Inbox)),
                    remote("Old", None),
                ],
            )
            .unwrap();
        let inbox_id = store
            .mailbox_by_role("alice", MailboxRole::Inbox)
            .unwrap()
            .unwrap()
            .id;

        store
            .replace_mailboxes(
                "alice",
                &[
                    remote("INBOX", Some(MailboxRole::Inbox)),
                    remote("Sent", Some(MailboxRole::Sent)),
                ],
            )
            .unwrap();

        let names: Vec<String> = store
            .list_mailboxes(Some("alice"))
            .unwrap()
            .into_iter()
            .map(|mailbox| mailbox.name)
            .collect();
        assert_eq!(names, vec!["INBOX", "Sent"]);
        assert_eq!(
            store
                .mailbox_by_role("alice", MailboxRole::Inbox)
                .unwrap()
                .unwrap()
                .id,
            inbox_id
        );
    }

    #[test]
    fn replace_mailboxes_refuses_a_list_without_inbox() {
        let (store, _directory) = test_support::store();
        store
            .insert_account(&test_support::account("alice"))
            .unwrap();
        let listed = [
            remote("INBOX", Some(MailboxRole::Inbox)),
            remote("Sent", Some(MailboxRole::Sent)),
        ];
        store.replace_mailboxes("alice", &listed).unwrap();

        assert!(matches!(
            store.replace_mailboxes("alice", &[]),
            Err(Error::Server(_))
        ));

        assert_eq!(store.list_mailboxes(Some("alice")).unwrap().len(), 2);
    }
}
