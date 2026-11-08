use std::collections::HashSet;

use mail_model::{EmailSummary, Result, ThreadPage, ThreadScope, ThreadSummary};
use rusqlite::{Transaction, params};

use crate::{EMAIL_COLUMNS, StorageResult, Store, email_from_row};

const NO_MAILBOX: i64 = -1;

pub(crate) fn refresh_threads(transaction: &Transaction, thread_ids: &HashSet<i64>) -> Result<()> {
    let mut remove_stale = transaction
        .prepare_cached(
            "DELETE FROM mailbox_thread WHERE thread_id = ?1 AND mailbox_id NOT IN (
               SELECT em.mailbox_id FROM email_mailbox em JOIN email e ON e.id = em.email_id WHERE e.thread_id = ?1)",
        )
        .storage()?;
    let mut upsert = transaction
        .prepare_cached(
            "INSERT INTO mailbox_thread (mailbox_id, thread_id, account_id, unified, latest_email_id,
               last_received_at, message_count, unread_count, is_flagged, has_attachment)
             SELECT em.mailbox_id, e.thread_id, e.account_id, COALESCE(m.role = 'inbox', 0), e.id,
               MAX(e.received_at), COUNT(*), SUM(1 - e.is_seen), SUM(e.is_flagged) > 0, SUM(e.has_attachment) > 0
             FROM email e
             JOIN email_mailbox em ON em.email_id = e.id
             JOIN mailbox m ON m.id = em.mailbox_id
             WHERE e.thread_id = ?1
             GROUP BY em.mailbox_id
             ON CONFLICT (mailbox_id, thread_id) DO UPDATE SET
               unified = excluded.unified,
               latest_email_id = excluded.latest_email_id,
               last_received_at = excluded.last_received_at,
               message_count = excluded.message_count,
               unread_count = excluded.unread_count,
               is_flagged = excluded.is_flagged,
               has_attachment = excluded.has_attachment",
        )
        .storage()?;
    let mut remove_empty = transaction
        .prepare_cached("DELETE FROM thread WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM email WHERE thread_id = ?1)")
        .storage()?;
    for thread_id in thread_ids {
        remove_stale.execute([thread_id]).storage()?;
        upsert.execute([thread_id]).storage()?;
        remove_empty.execute([thread_id]).storage()?;
    }
    Ok(())
}

fn parse_cursor(cursor: Option<&str>) -> (i64, i64) {
    cursor
        .and_then(|value| value.split_once(':'))
        .and_then(|(received_at, row_id)| Some((received_at.parse().ok()?, row_id.parse().ok()?)))
        .unwrap_or((i64::MAX, i64::MAX))
}

impl Store {
    pub fn list_threads(
        &self,
        scope: ThreadScope,
        unread_only: bool,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<ThreadPage> {
        let (cursor_received_at, cursor_row_id) = parse_cursor(cursor);
        let (scope_filter, scope_value) = match scope {
            ThreadScope::Unified => ("mt.unified = 1", 0),
            ThreadScope::Mailbox(mailbox_id) => ("mt.mailbox_id = ?1", mailbox_id),
        };
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT mt.rowid, mt.thread_id, mt.mailbox_id, mt.message_count, mt.unread_count, mt.is_flagged,
                   mt.has_attachment, mt.last_received_at, {EMAIL_COLUMNS}
                 FROM mailbox_thread mt JOIN email e ON e.id = mt.latest_email_id
                 WHERE {scope_filter}
                   AND (?2 = 0 OR mt.unread_count > 0)
                   AND (mt.last_received_at < ?3 OR (mt.last_received_at = ?3 AND mt.rowid < ?4))
                 ORDER BY mt.last_received_at DESC, mt.rowid DESC
                 LIMIT ?5"
            ))
            .storage()?;
        let mut last_position = None;
        let threads: Vec<ThreadSummary> = statement
            .query_map(
                params![
                    scope_value,
                    unread_only,
                    cursor_received_at,
                    cursor_row_id,
                    limit
                ],
                |row| {
                    let row_id: i64 = row.get(0)?;
                    let last_received_at: i64 = row.get(7)?;
                    last_position = Some((last_received_at, row_id));
                    let latest = email_from_row(row, 8)?;
                    Ok(ThreadSummary {
                        thread_id: row.get(1)?,
                        mailbox_id: row.get(2)?,
                        account_id: latest.account_id.clone(),
                        message_count: row.get(3)?,
                        unread_count: row.get(4)?,
                        is_flagged: row.get(5)?,
                        has_attachment: row.get(6)?,
                        last_received_at,
                        latest,
                    })
                },
            )
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()?;
        let next_cursor = (threads.len() as u32 == limit)
            .then_some(last_position)
            .flatten()
            .map(|(received_at, row_id)| format!("{received_at}:{row_id}"));
        Ok(ThreadPage {
            threads,
            next_cursor,
        })
    }

    pub fn thread_emails(
        &self,
        thread_id: i64,
        context_mailbox_id: Option<i64>,
    ) -> Result<Vec<EmailSummary>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT {EMAIL_COLUMNS} FROM email e
                 WHERE e.thread_id = ?1 AND EXISTS (
                   SELECT 1 FROM email_mailbox em JOIN mailbox m ON m.id = em.mailbox_id
                   WHERE em.email_id = e.id
                     AND (em.mailbox_id = ?2 OR m.role IS NULL OR m.role NOT IN ('trash', 'junk')))
                 ORDER BY e.received_at"
            ))
            .storage()?;
        statement
            .query_map(
                params![thread_id, context_mailbox_id.unwrap_or(NO_MAILBOX)],
                |row| email_from_row(row, 0),
            )
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }
}

#[cfg(test)]
mod tests {
    use mail_model::{
        Address, FetchedMessage, Flags, Keyword, MailboxRole, ParsedHeaders, RemoteMailbox,
    };

    use super::*;
    use crate::test_support;

    fn message(
        uid: u32,
        message_id: &str,
        references: &[&str],
        received_at: i64,
        seen: bool,
    ) -> FetchedMessage {
        FetchedMessage {
            uid,
            flags: Flags {
                seen,
                ..Flags::default()
            },
            internal_date: Some(received_at),
            size: 100,
            headers: ParsedHeaders {
                message_id: Some(message_id.into()),
                references: references.iter().map(|value| value.to_string()).collect(),
                subject: Some(format!("Subject {uid}")),
                from: vec![Address {
                    name: Some("Bob".into()),
                    email: "bob@example.com".into(),
                }],
                preview: Some(format!("preview of {message_id}")),
                ..ParsedHeaders::default()
            },
        }
    }

    fn setup() -> (Store, std::path::PathBuf, i64, i64) {
        let (store, directory) = test_support::store();
        store
            .insert_account(&test_support::account("alice"))
            .unwrap();
        let mailbox = |name: &str, role| RemoteMailbox {
            remote_name: name.into(),
            name: name.into(),
            depth: 0,
            role: Some(role),
            selectable: true,
        };
        store
            .replace_mailboxes(
                "alice",
                &[
                    mailbox("INBOX", MailboxRole::Inbox),
                    mailbox("Trash", MailboxRole::Trash),
                ],
            )
            .unwrap();
        let inbox = store
            .mailbox_by_role("alice", MailboxRole::Inbox)
            .unwrap()
            .unwrap()
            .id;
        let trash = store
            .mailbox_by_role("alice", MailboxRole::Trash)
            .unwrap()
            .unwrap()
            .id;
        (store, directory, inbox, trash)
    }

    #[test]
    fn replies_are_grouped_in_one_thread_and_pages_follow_the_cursor() {
        let (store, _directory, inbox, _) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(1, "root@x", &[], 1_000, true),
                    message(2, "reply@x", &["root@x"], 3_000, false),
                    message(3, "other@x", &[], 2_000, false),
                ],
            )
            .unwrap();

        let first_page = store
            .list_threads(ThreadScope::Unified, false, None, 1)
            .unwrap();
        assert_eq!(first_page.threads.len(), 1);
        assert_eq!(first_page.threads[0].message_count, 2);
        assert_eq!(first_page.threads[0].unread_count, 1);
        assert_eq!(
            first_page.threads[0].latest.preview.as_deref(),
            Some("preview of reply@x")
        );

        let second_page = store
            .list_threads(
                ThreadScope::Unified,
                false,
                first_page.next_cursor.as_deref(),
                1,
            )
            .unwrap();
        assert_eq!(
            second_page.threads[0].latest.subject.as_deref(),
            Some("Subject 3")
        );
        let third_page = store
            .list_threads(
                ThreadScope::Unified,
                false,
                second_page.next_cursor.as_deref(),
                1,
            )
            .unwrap();
        assert!(third_page.threads.is_empty());
    }

    #[test]
    fn keywords_and_moves_update_thread_aggregates_and_counts() {
        let (store, _directory, inbox, trash) = setup();
        store
            .insert_messages("alice", inbox, &[message(1, "a@x", &[], 1_000, false)])
            .unwrap();
        store.set_mailbox_counts(inbox, 1, 1).unwrap();
        let thread = store
            .list_threads(ThreadScope::Mailbox(inbox), true, None, 10)
            .unwrap()
            .threads[0]
            .clone();

        store
            .set_keywords(&[thread.latest.id], &[Keyword::Seen], &[])
            .unwrap();
        assert!(
            store
                .list_threads(ThreadScope::Mailbox(inbox), true, None, 10)
                .unwrap()
                .threads
                .is_empty()
        );
        assert_eq!(store.mailbox(inbox).unwrap().unread_count, 0);

        let sources = store
            .move_emails(&[thread.latest.id], inbox, Some(trash))
            .unwrap();
        assert_eq!(sources[0].uid, Some(1));
        assert!(
            store
                .list_threads(ThreadScope::Unified, false, None, 10)
                .unwrap()
                .threads
                .is_empty()
        );
        assert_eq!(
            store
                .list_threads(ThreadScope::Mailbox(trash), false, None, 10)
                .unwrap()
                .threads
                .len(),
            1
        );
        assert!(
            store
                .thread_emails(thread.thread_id, None)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            store
                .thread_emails(thread.thread_id, Some(trash))
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn a_flag_set_on_any_copy_of_a_message_is_kept() {
        let (store, _directory, inbox, trash) = setup();
        store
            .insert_messages("alice", inbox, &[message(1, "self@x", &[], 1_000, false)])
            .unwrap();
        store
            .insert_messages("alice", trash, &[message(9, "self@x", &[], 1_000, true)])
            .unwrap();
        store.update_flags(inbox, &[(1, Flags::default())]).unwrap();
        let unread = |store: &Store| {
            store
                .list_threads(ThreadScope::Mailbox(inbox), false, None, 1)
                .unwrap()
                .threads[0]
                .unread_count
        };
        assert_eq!(unread(&store), 0);

        store.remove_uids(trash, &[9]).unwrap();
        store.update_flags(inbox, &[(1, Flags::default())]).unwrap();
        assert_eq!(unread(&store), 1);
    }

    #[test]
    fn removed_uids_delete_orphan_emails_and_search_finds_the_rest() {
        let (store, _directory, inbox, _) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(1, "a@x", &[], 1_000, false),
                    message(2, "b@x", &[], 2_000, false),
                ],
            )
            .unwrap();
        store.remove_uids(inbox, &[1]).unwrap();
        assert_eq!(store.local_uids(inbox).unwrap(), vec![2]);
        assert_eq!(store.search("subj", 10).unwrap().len(), 1);
        assert_eq!(store.search("b@x", 10).unwrap().len(), 1);
    }
}
