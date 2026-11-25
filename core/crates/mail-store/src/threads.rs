use std::collections::HashSet;

use mail_model::{
    Category, EmailSummary, Result, ThreadFilter, ThreadPage, ThreadScope, ThreadSummary,
};
use rusqlite::{ToSql, Transaction, params, params_from_iter};

use crate::categories::THREAD_CATEGORY;
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
        .prepare_cached(&format!(
            "INSERT INTO mailbox_thread (mailbox_id, thread_id, account_id, unified, latest_email_id,
               last_received_at, message_count, unread_count, is_flagged, has_attachment, category)
             SELECT em.mailbox_id, e.thread_id, e.account_id, COALESCE(m.role = 'inbox', 0), e.id,
               MAX(e.received_at), COUNT(*), SUM(1 - e.is_seen), SUM(e.is_flagged) > 0, SUM(e.has_attachment) > 0,
               {THREAD_CATEGORY}
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
               has_attachment = excluded.has_attachment,
               category = excluded.category"
        ))
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

fn addressed_to_account(column: &str) -> String {
    format!(
        "EXISTS (SELECT 1 FROM email x JOIN email_mailbox xm ON xm.email_id = x.id
           JOIN account a ON a.id = x.account_id, json_each(x.{column}) j
           WHERE x.thread_id = mt.thread_id AND xm.mailbox_id = mt.mailbox_id
             AND lower(json_extract(j.value, '$.email')) = lower(a.email))"
    )
}

fn bound_list<T: ToSql + Clone + 'static>(items: &[T], values: &mut Vec<Box<dyn ToSql>>) -> String {
    let start = values.len() + 1;
    values.extend(
        items
            .iter()
            .map(|item| Box::new(item.clone()) as Box<dyn ToSql>),
    );
    (start..start + items.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn filter_sql(filter: &ThreadFilter, values: &mut Vec<Box<dyn ToSql>>) -> String {
    let any =
        |clauses: Vec<String>| (!clauses.is_empty()).then(|| format!("({})", clauses.join(" OR ")));
    let include = any([
        filter.unread.then(|| "mt.unread_count > 0".to_owned()),
        filter.flagged.then(|| "mt.is_flagged".to_owned()),
    ]
    .into_iter()
    .flatten()
    .collect());
    let addressed = any([
        filter.to_me.then(|| addressed_to_account("to_json")),
        filter.cc_me.then(|| addressed_to_account("cc_json")),
    ]
    .into_iter()
    .flatten()
    .collect());
    let accounts = (!filter.account_ids.is_empty()).then(|| {
        format!(
            "mt.account_id IN ({})",
            bound_list(&filter.account_ids, values)
        )
    });
    let criteria: Vec<String> = [
        include,
        addressed,
        filter
            .with_attachment
            .then(|| "mt.has_attachment".to_owned()),
        filter
            .since
            .map(|since| format!("mt.last_received_at >= {}", bound_list(&[since], values))),
        accounts,
    ]
    .into_iter()
    .flatten()
    .collect();
    let criteria = if criteria.is_empty() {
        "1".to_owned()
    } else {
        criteria.join(" AND ")
    };
    if filter.keep_thread_ids.is_empty() {
        format!("({criteria})")
    } else {
        format!(
            "(mt.thread_id IN ({}) OR ({criteria}))",
            bound_list(&filter.keep_thread_ids, values)
        )
    }
}

impl Store {
    pub fn list_threads(
        &self,
        scope: ThreadScope,
        filter: &ThreadFilter,
        category: Option<Category>,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<ThreadPage> {
        let (cursor_received_at, cursor_row_id) = parse_cursor(cursor);
        let (scope_filter, scope_value) = match scope {
            ThreadScope::Unified => ("mt.unified = 1", 0),
            ThreadScope::Mailbox(mailbox_id) => ("mt.mailbox_id = ?1", mailbox_id),
        };
        let mut values: Vec<Box<dyn ToSql>> = vec![
            Box::new(scope_value),
            Box::new(cursor_received_at),
            Box::new(cursor_row_id),
            Box::new(limit),
            Box::new(category.map(Category::code)),
        ];
        let filter_sql = filter_sql(filter, &mut values);
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(&format!(
                "SELECT mt.rowid, mt.thread_id, mt.mailbox_id, mt.message_count, mt.unread_count, mt.is_flagged,
                   mt.has_attachment, mt.last_received_at, mt.category, {EMAIL_COLUMNS}
                 FROM mailbox_thread mt JOIN email e ON e.id = mt.latest_email_id
                 WHERE {scope_filter}
                   AND {filter_sql}
                   AND (?5 IS NULL OR mt.category = ?5)
                   AND (mt.last_received_at < ?2 OR (mt.last_received_at = ?2 AND mt.rowid < ?3))
                 ORDER BY mt.last_received_at DESC, mt.rowid DESC
                 LIMIT ?4"
            ))
            .storage()?;
        let mut last_position = None;
        let threads: Vec<ThreadSummary> = statement
            .query_map(params_from_iter(values.iter()), |row| {
                let row_id: i64 = row.get(0)?;
                let last_received_at: i64 = row.get(7)?;
                last_position = Some((last_received_at, row_id));
                let latest = email_from_row(row, 9)?;
                Ok(ThreadSummary {
                    thread_id: row.get(1)?,
                    mailbox_id: row.get(2)?,
                    account_id: latest.account_id.clone(),
                    message_count: row.get(3)?,
                    unread_count: row.get(4)?,
                    is_flagged: row.get(5)?,
                    has_attachment: row.get(6)?,
                    last_received_at,
                    category: Category::from_code(row.get(8)?),
                    latest,
                })
            })
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
#[path = "../../../tests/mail_store/threads.rs"]
mod tests;
