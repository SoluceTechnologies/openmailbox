use std::collections::HashSet;

use mail_model::{
    Address, EmailSummary, Error, FetchedMessage, Flags, Keyword, RenderedBody, Result, now_millis,
};
use rusqlite::{OptionalExtension, Transaction, params, params_from_iter};

use crate::threads::refresh_threads;
use crate::{
    EMAIL_COLUMNS, StorageResult, Store, addresses_from_json, addresses_to_json, email_from_row,
    placeholders,
};

const INDEXED_BODY_LIMIT: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageLocation {
    pub email_id: i64,
    pub mailbox_id: i64,
    pub uid: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct ReplyContext {
    pub account_id: String,
    pub message_id: Option<String>,
    pub references: Vec<String>,
    pub subject: Option<String>,
    pub from: Vec<Address>,
    pub reply_to: Vec<Address>,
}

impl Store {
    pub fn local_uids(&self, mailbox_id: i64) -> Result<Vec<u32>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(
                "SELECT uid FROM email_mailbox WHERE mailbox_id = ?1 AND uid IS NOT NULL",
            )
            .storage()?;
        statement
            .query_map([mailbox_id], |row| row.get(0))
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn insert_messages(
        &self,
        account_id: &str,
        mailbox_id: i64,
        messages: &[FetchedMessage],
    ) -> Result<()> {
        self.write(|transaction| {
            let mut touched_threads = HashSet::new();
            for message in messages {
                let existing = find_by_message_id(transaction, account_id, message)?;
                let (email_id, thread_id) = match existing {
                    Some(found) => found,
                    None => insert_email(transaction, account_id, mailbox_id, message)?,
                };
                transaction
                    .prepare_cached(
                        "INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (?1, ?2, ?3)
                         ON CONFLICT (mailbox_id, email_id) DO UPDATE SET uid = excluded.uid",
                    )
                    .storage()?
                    .execute(params![mailbox_id, email_id, message.uid])
                    .storage()?;
                if existing.is_some() {
                    apply_flags(transaction, email_id, message.flags)?;
                }
                touched_threads.insert(thread_id);
            }
            refresh_threads(transaction, &touched_threads)
        })
    }

    pub fn update_flags(&self, mailbox_id: i64, updates: &[(u32, Flags)]) -> Result<bool> {
        self.write(|transaction| {
            let mut touched_threads = HashSet::new();
            let mut find = transaction
                .prepare_cached(
                    "SELECT email_id FROM email_mailbox WHERE mailbox_id = ?1 AND uid = ?2",
                )
                .storage()?;
            for (uid, flags) in updates {
                let email_id: Option<i64> = find
                    .query_row(params![mailbox_id, uid], |row| row.get(0))
                    .optional()
                    .storage()?;
                if let Some(email_id) = email_id {
                    touched_threads.extend(apply_flags(transaction, email_id, *flags)?);
                }
            }
            refresh_threads(transaction, &touched_threads)?;
            Ok(!touched_threads.is_empty())
        })
    }

    pub fn remove_uids(&self, mailbox_id: i64, uids: &[u32]) -> Result<()> {
        if uids.is_empty() {
            return Ok(());
        }
        self.write(|transaction| {
            let mut email_ids = Vec::with_capacity(uids.len());
            let mut statement = transaction
                .prepare_cached("DELETE FROM email_mailbox WHERE mailbox_id = ?1 AND uid = ?2 RETURNING email_id")
                .storage()?;
            for uid in uids {
                let email_id: Option<i64> =
                    statement.query_row(params![mailbox_id, uid], |row| row.get(0)).optional().storage()?;
                email_ids.extend(email_id);
            }
            remove_orphans(transaction, &email_ids)
        })
    }

    pub fn clear_unconfirmed_links(&self, mailbox_id: i64) -> Result<()> {
        self.write(|transaction| {
            let email_ids: Vec<i64> = transaction
                .prepare_cached("DELETE FROM email_mailbox WHERE mailbox_id = ?1 AND uid IS NULL RETURNING email_id")
                .storage()?
                .query_map([mailbox_id], |row| row.get(0))
                .storage()?
                .collect::<rusqlite::Result<_>>()
                .storage()?;
            remove_orphans(transaction, &email_ids)
        })
    }

    pub fn thread_email_ids(&self, mailbox_id: i64, thread_id: i64) -> Result<Vec<i64>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(
                "SELECT e.id FROM email e JOIN email_mailbox em ON em.email_id = e.id
                 WHERE em.mailbox_id = ?1 AND e.thread_id = ?2",
            )
            .storage()?;
        statement
            .query_map([mailbox_id, thread_id], |row| row.get(0))
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn set_keywords(
        &self,
        email_ids: &[i64],
        add: &[Keyword],
        remove: &[Keyword],
    ) -> Result<Vec<i64>> {
        self.write(|transaction| {
            let mut touched_threads = HashSet::new();
            let changes = add.iter().map(|keyword| (*keyword, true)).chain(remove.iter().map(|keyword| (*keyword, false)));
            for (keyword, value) in changes {
                let column = keyword.column();
                let changed: Vec<(i64, i64)> = transaction
                    .prepare(&format!(
                        "UPDATE email SET {column} = ?1 WHERE {column} != ?1 AND id IN ({})
                         RETURNING id, thread_id",
                        placeholders(email_ids.len())
                    ))
                    .storage()?
                    .query_map(
                        params_from_iter(std::iter::once(value as i64).chain(email_ids.iter().copied())),
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .storage()?
                    .collect::<rusqlite::Result<_>>()
                    .storage()?;
                if keyword == Keyword::Seen {
                    let delta = if value { -1 } else { 1 };
                    for (email_id, _) in &changed {
                        transaction
                            .prepare_cached(
                                "UPDATE mailbox SET unread_count = MAX(unread_count + ?2, 0)
                                 WHERE id IN (SELECT mailbox_id FROM email_mailbox WHERE email_id = ?1)",
                            )
                            .storage()?
                            .execute(params![email_id, delta])
                            .storage()?;
                    }
                }
                touched_threads.extend(changed.into_iter().map(|(_, thread_id)| thread_id));
            }
            refresh_threads(transaction, &touched_threads)?;
            mailboxes_of(transaction, email_ids)
        })
    }

    pub fn move_emails(
        &self,
        email_ids: &[i64],
        from_mailbox_id: i64,
        to_mailbox_id: Option<i64>,
    ) -> Result<Vec<MessageLocation>> {
        self.write(|transaction| {
            let id_list = placeholders(email_ids.len());
            let sources: Vec<(MessageLocation, bool)> = transaction
                .prepare(&format!(
                    "DELETE FROM email_mailbox WHERE mailbox_id = ? AND email_id IN ({id_list})
                     RETURNING email_id, uid, (SELECT is_seen FROM email WHERE id = email_id)"
                ))
                .storage()?
                .query_map(
                    params_from_iter(std::iter::once(from_mailbox_id).chain(email_ids.iter().copied())),
                    |row| {
                        Ok((
                            MessageLocation { email_id: row.get(0)?, mailbox_id: from_mailbox_id, uid: row.get(1)? },
                            row.get(2)?,
                        ))
                    },
                )
                .storage()?
                .collect::<rusqlite::Result<_>>()
                .storage()?;
            let moved = sources.len() as i64;
            let moved_unread = sources.iter().filter(|(_, seen)| !seen).count() as i64;
            adjust_counts(transaction, from_mailbox_id, -moved, -moved_unread)?;
            let moved_ids: Vec<i64> = sources.iter().map(|(location, _)| location.email_id).collect();
            match to_mailbox_id {
                Some(target) => {
                    let mut link = transaction
                        .prepare_cached(
                            "INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (?1, ?2, NULL)
                             ON CONFLICT DO NOTHING",
                        )
                        .storage()?;
                    for email_id in &moved_ids {
                        link.execute([target, *email_id]).storage()?;
                    }
                    adjust_counts(transaction, target, moved, moved_unread)?;
                    refresh_threads(transaction, &thread_ids_of(transaction, &moved_ids)?)?;
                }
                None => remove_orphans(transaction, &moved_ids)?,
            }
            Ok(sources.into_iter().map(|(location, _)| location).collect())
        })
    }

    pub fn fetch_location(&self, email_id: i64) -> Result<(String, u32)> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT m.remote_name, em.uid FROM email_mailbox em JOIN mailbox m ON m.id = em.mailbox_id
                 WHERE em.email_id = ?1 AND em.uid IS NOT NULL
                 ORDER BY CASE m.role WHEN 'inbox' THEN 0 ELSE 1 END LIMIT 1",
                [email_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn locations(&self, email_ids: &[i64]) -> Result<Vec<MessageLocation>> {
        let connection = self.read();
        let mut statement = connection
            .prepare(&format!(
                "SELECT email_id, mailbox_id, uid FROM email_mailbox WHERE email_id IN ({})",
                placeholders(email_ids.len())
            ))
            .storage()?;
        statement
            .query_map(params_from_iter(email_ids), |row| {
                Ok(MessageLocation {
                    email_id: row.get(0)?,
                    mailbox_id: row.get(1)?,
                    uid: row.get(2)?,
                })
            })
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    pub fn account_of_email(&self, email_id: i64) -> Result<String> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT account_id FROM email WHERE id = ?1",
                [email_id],
                |row| row.get(0),
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn reply_context(&self, email_id: i64) -> Result<ReplyContext> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT account_id, message_id, references_header, subject, from_json, reply_to_json
                 FROM email WHERE id = ?1",
                [email_id],
                |row| {
                    Ok(ReplyContext {
                        account_id: row.get(0)?,
                        message_id: row.get(1)?,
                        references: row
                            .get::<_, Option<String>>(2)?
                            .map(|header| header.split_whitespace().map(str::to_owned).collect())
                            .unwrap_or_default(),
                        subject: row.get(3)?,
                        from: addresses_from_json(&row.get::<_, String>(4)?),
                        reply_to: addresses_from_json(&row.get::<_, String>(5)?),
                    })
                },
            )
            .optional()
            .storage()?
            .ok_or(Error::NotFound)
    }

    pub fn body(&self, email_id: i64) -> Result<Option<RenderedBody>> {
        let connection = self.read();
        connection
            .query_row(
                "SELECT html, text, attachments_json, has_remote_content FROM email_body WHERE email_id = ?1",
                [email_id],
                |row| {
                    Ok(RenderedBody {
                        html: row.get(0)?,
                        text: row.get(1)?,
                        attachments: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
                        has_remote_content: row.get(3)?,
                    })
                },
            )
            .optional()
            .storage()
    }

    pub fn save_body(&self, email_id: i64, body: &RenderedBody) -> Result<()> {
        self.write(|transaction| {
            transaction
                .execute(
                    "INSERT OR REPLACE INTO email_body (email_id, html, text, attachments_json, has_remote_content)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        email_id,
                        body.html,
                        body.text,
                        serde_json::to_string(&body.attachments).unwrap_or_else(|_| "[]".into()),
                        body.has_remote_content,
                    ],
                )
                .storage()?;
            transaction.execute("UPDATE email SET body_state = 2 WHERE id = ?1", [email_id]).storage()?;
            let indexed_body: String = body.text.chars().take(INDEXED_BODY_LIMIT).collect();
            transaction.execute("DELETE FROM email_fts WHERE rowid = ?1", [email_id]).storage()?;
            transaction
                .execute(
                    "INSERT INTO email_fts (rowid, subject, participants, body)
                     SELECT id, subject, ?2, ?3 FROM email WHERE id = ?1",
                    params![email_id, participants_of_email(transaction, email_id)?, indexed_body],
                )
                .storage()?;
            Ok(())
        })
    }

    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<EmailSummary>> {
        let match_expression = fts_query(query);
        if match_expression.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT {EMAIL_COLUMNS} FROM email e
                 WHERE e.id IN (SELECT rowid FROM email_fts WHERE email_fts MATCH ?1)
                 ORDER BY e.received_at DESC LIMIT ?2"
            ))
            .storage()?;
        statement
            .query_map(params![match_expression, limit], |row| {
                email_from_row(row, 0)
            })
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }
}

fn find_by_message_id(
    transaction: &Transaction,
    account_id: &str,
    message: &FetchedMessage,
) -> Result<Option<(i64, i64)>> {
    let Some(message_id) = &message.headers.message_id else {
        return Ok(None);
    };
    transaction
        .prepare_cached(
            "SELECT id, thread_id FROM email WHERE account_id = ?1 AND message_id = ?2 LIMIT 1",
        )
        .storage()?
        .query_row(params![account_id, message_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .optional()
        .storage()
}

/// IMAP keeps flags per copy while the store keeps one email per Message-ID. When an email has
/// several copies (the inbox and the Sent copy of a message sent to oneself), a flag set on any
/// copy wins, otherwise every sync of each folder would flip the flags of the other.
fn apply_flags(transaction: &Transaction, email_id: i64, incoming: Flags) -> Result<Option<i64>> {
    let (thread_id, current, copies): (i64, Flags, i64) = transaction
        .prepare_cached(
            "SELECT thread_id, is_seen, is_flagged, is_answered, is_draft,
               (SELECT COUNT(*) FROM email_mailbox WHERE email_id = ?1)
             FROM email WHERE id = ?1",
        )
        .storage()?
        .query_row([email_id], |row| {
            let current = Flags {
                seen: row.get(1)?,
                flagged: row.get(2)?,
                answered: row.get(3)?,
                draft: row.get(4)?,
                deleted: false,
            };
            Ok((row.get(0)?, current, row.get(5)?))
        })
        .storage()?;
    let merged = if copies > 1 {
        Flags {
            seen: current.seen || incoming.seen,
            flagged: current.flagged || incoming.flagged,
            answered: current.answered || incoming.answered,
            draft: current.draft || incoming.draft,
            deleted: false,
        }
    } else {
        Flags {
            deleted: false,
            ..incoming
        }
    };
    if merged == current {
        return Ok(None);
    }
    transaction
        .prepare_cached(
            "UPDATE email SET is_seen = ?2, is_flagged = ?3, is_answered = ?4, is_draft = ?5 WHERE id = ?1",
        )
        .storage()?
        .execute(params![email_id, merged.seen, merged.flagged, merged.answered, merged.draft])
        .storage()?;
    Ok(Some(thread_id))
}

fn insert_email(
    transaction: &Transaction,
    account_id: &str,
    mailbox_id: i64,
    message: &FetchedMessage,
) -> Result<(i64, i64)> {
    let headers = &message.headers;
    let root = headers
        .thread_root()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("local:{mailbox_id}:{}", message.uid));
    let thread_id: i64 = transaction
        .prepare_cached(
            "INSERT INTO thread (account_id, root) VALUES (?1, ?2)
             ON CONFLICT (account_id, root) DO UPDATE SET root = excluded.root RETURNING id",
        )
        .storage()?
        .query_row(params![account_id, root], |row| row.get(0))
        .storage()?;
    let received_at = message
        .internal_date
        .or(headers.date)
        .unwrap_or_else(now_millis);
    let references = (!headers.references.is_empty()).then(|| headers.references.join(" "));
    let email_id: i64 = transaction
        .prepare_cached(
            "INSERT INTO email (account_id, thread_id, message_id, references_header, subject, from_json, to_json,
               cc_json, reply_to_json, received_at, size, preview, has_attachment, is_seen, is_flagged,
               is_answered, is_draft)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17) RETURNING id",
        )
        .storage()?
        .query_row(
            params![
                account_id,
                thread_id,
                headers.message_id,
                references,
                headers.subject,
                addresses_to_json(&headers.from),
                addresses_to_json(&headers.to),
                addresses_to_json(&headers.cc),
                addresses_to_json(&headers.reply_to),
                received_at,
                message.size,
                headers.preview,
                headers.has_attachment,
                message.flags.seen,
                message.flags.flagged,
                message.flags.answered,
                message.flags.draft,
            ],
            |row| row.get(0),
        )
        .storage()?;
    let participants = headers
        .from
        .iter()
        .chain(&headers.to)
        .chain(&headers.cc)
        .flat_map(|address| address.name.iter().chain(std::iter::once(&address.email)))
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    transaction
        .prepare_cached(
            "INSERT INTO email_fts (rowid, subject, participants, body) VALUES (?1, ?2, ?3, ?4)",
        )
        .storage()?
        .execute(params![
            email_id,
            headers.subject,
            participants,
            headers.preview
        ])
        .storage()?;
    Ok((email_id, thread_id))
}

fn participants_of_email(transaction: &Transaction, email_id: i64) -> Result<String> {
    let (from, to, cc): (String, String, String) = transaction
        .query_row(
            "SELECT from_json, to_json, cc_json FROM email WHERE id = ?1",
            [email_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .storage()?;
    Ok([from, to, cc]
        .iter()
        .flat_map(|json| addresses_from_json(json))
        .flat_map(|address| {
            address
                .name
                .into_iter()
                .chain(std::iter::once(address.email))
        })
        .collect::<Vec<_>>()
        .join(" "))
}

fn thread_ids_of(transaction: &Transaction, email_ids: &[i64]) -> Result<HashSet<i64>> {
    if email_ids.is_empty() {
        return Ok(HashSet::new());
    }
    transaction
        .prepare(&format!(
            "SELECT DISTINCT thread_id FROM email WHERE id IN ({})",
            placeholders(email_ids.len())
        ))
        .storage()?
        .query_map(params_from_iter(email_ids), |row| row.get(0))
        .storage()?
        .collect::<rusqlite::Result<_>>()
        .storage()
}

fn mailboxes_of(transaction: &Transaction, email_ids: &[i64]) -> Result<Vec<i64>> {
    if email_ids.is_empty() {
        return Ok(Vec::new());
    }
    transaction
        .prepare(&format!(
            "SELECT DISTINCT mailbox_id FROM email_mailbox WHERE email_id IN ({})",
            placeholders(email_ids.len())
        ))
        .storage()?
        .query_map(params_from_iter(email_ids), |row| row.get(0))
        .storage()?
        .collect::<rusqlite::Result<_>>()
        .storage()
}

fn remove_orphans(transaction: &Transaction, email_ids: &[i64]) -> Result<()> {
    let touched_threads = thread_ids_of(transaction, email_ids)?;
    let mut delete = transaction
        .prepare_cached("DELETE FROM email WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM email_mailbox WHERE email_id = ?1)")
        .storage()?;
    for email_id in email_ids {
        delete.execute([email_id]).storage()?;
    }
    refresh_threads(transaction, &touched_threads)
}

fn adjust_counts(
    transaction: &Transaction,
    mailbox_id: i64,
    total_delta: i64,
    unread_delta: i64,
) -> Result<()> {
    transaction
        .prepare_cached(
            "UPDATE mailbox SET total_count = MAX(total_count + ?2, 0), unread_count = MAX(unread_count + ?3, 0)
             WHERE id = ?1",
        )
        .storage()?
        .execute(params![mailbox_id, total_delta, unread_delta])
        .storage()?;
    Ok(())
}

fn fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| term.replace('"', ""))
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{term}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}
