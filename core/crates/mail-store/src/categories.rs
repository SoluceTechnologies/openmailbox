use std::collections::HashSet;

use mail_model::{CLASSIFIER_VERSION, Category, ParsedHeaders, Result, SendingSignals, classify};
use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::threads::refresh_threads;
use crate::{StorageResult, Store};

/// The most important category among a mailbox's messages of a thread (see [`Category`]). Sums
/// rather than MIN: `refresh_threads` relies on its single MAX to pick the latest email's row.
pub(crate) const THREAD_CATEGORY: &str = "CASE
       WHEN SUM(COALESCE(e.category, 0) = 0) > 0 THEN 0
       WHEN SUM(e.category = 1) > 0 THEN 1
       WHEN SUM(e.category = 2) > 0 THEN 2
       ELSE 3 END";

fn domain(address: &str) -> Option<&str> {
    address.rsplit_once('@').map(|(_, domain)| domain)
}

/// Senders the user moved come first, then the user's own mail and their colleagues', then people
/// the user writes to, then the header rules.
fn decide(
    connection: &Connection,
    account_email: &str,
    sender: Option<&str>,
    subject: Option<&str>,
    signals: SendingSignals,
) -> Result<Category> {
    let Some(sender) = sender else {
        return Ok(classify(None, subject, signals));
    };
    let chosen: Option<i64> = connection
        .prepare_cached("SELECT category FROM sender_category WHERE email = ?1")
        .storage()?
        .query_row([sender], |row| row.get(0))
        .optional()
        .storage()?;
    if let Some(code) = chosen {
        return Ok(Category::from_code(code));
    }
    // Colleagues' newsletters stay with their mail, as in Mail; programs sending in the user's
    // name or from the user's domain (a GitLab, a form, a no-reply) still say so.
    let colleague = domain(sender).is_some_and(|theirs| {
        domain(account_email).is_some_and(|ours| theirs.eq_ignore_ascii_case(ours))
    });
    if colleague
        && !signals.automated
        && classify(Some(sender), subject, SendingSignals::default()) == Category::Primary
    {
        return Ok(Category::Primary);
    }
    let written_to: bool = connection
        .prepare_cached("SELECT sent > 0 FROM correspondent WHERE email = ?1")
        .storage()?
        .query_row([sender], |row| row.get(0))
        .optional()
        .storage()?
        .unwrap_or(false);
    // The user's own address is no correspondent: writing to oneself says nothing of the
    // programs that send in one's name.
    Ok(
        if written_to && !sender.eq_ignore_ascii_case(account_email) {
            Category::Primary
        } else {
            classify(Some(sender), subject, signals)
        },
    )
}

pub(crate) fn category_of(
    transaction: &Transaction,
    account_email: &str,
    headers: &ParsedHeaders,
) -> Result<Category> {
    let sender = headers.from.first().map(|address| address.email.as_str());
    decide(
        transaction,
        account_email,
        sender,
        headers.subject.as_deref(),
        headers.signals,
    )
}

/// When the rules changed since the mail was classified, or for mail stored before categories,
/// classifies it again from what is stored. Messages whose headers were never fetched keep their
/// category: the inbox ones are classified again once their headers are (see
/// [`Store::uids_with_unknown_signals`]).
pub(crate) fn classify_again(connection: &Connection) -> Result<()> {
    let classified_with: Option<i64> = connection
        .query_row(
            "SELECT value FROM store_setting WHERE key = 'classifier'",
            [],
            |row| row.get(0),
        )
        .optional()
        .storage()?;
    if classified_with == Some(CLASSIFIER_VERSION) {
        return Ok(());
    }
    let transaction = connection.unchecked_transaction().storage()?;
    let stored: Vec<(
        i64,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
        String,
    )> = transaction
        .prepare(
            "SELECT e.id, e.sender, e.subject, e.signals, e.category, a.email
                 FROM email e JOIN account a ON a.id = e.account_id
                 WHERE e.signals IS NOT NULL OR e.category IS NULL",
        )
        .storage()?
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .storage()?
        .collect::<rusqlite::Result<_>>()
        .storage()?;
    {
        let mut update = transaction
            .prepare("UPDATE email SET category = ?2 WHERE id = ?1")
            .storage()?;
        for (email_id, sender, subject, signals, previous, account_email) in &stored {
            let category = decide(
                &transaction,
                account_email,
                sender.as_deref(),
                subject.as_deref(),
                signals.map(SendingSignals::from_bits).unwrap_or_default(),
            )?;
            if *previous != Some(category.code()) {
                update
                    .execute(params![email_id, category.code()])
                    .storage()?;
            }
        }
    }
    // CROSS JOIN keeps SQLite on the thread's own messages rather than every message of the
    // mailbox, for each thread: 30 times faster on a real inbox.
    transaction
        .execute_batch(&format!(
            "UPDATE mailbox_thread SET category = (
               SELECT {THREAD_CATEGORY} FROM email e CROSS JOIN email_mailbox em ON em.email_id = e.id
               WHERE e.thread_id = mailbox_thread.thread_id AND em.mailbox_id = mailbox_thread.mailbox_id);
             INSERT INTO store_setting (key, value) VALUES ('classifier', {CLASSIFIER_VERSION})
               ON CONFLICT (key) DO UPDATE SET value = excluded.value;"
        ))
        .storage()?;
    transaction.commit().storage()
}

impl Store {
    /// Inbox messages stored before their sending headers were fetched, newest first.
    pub fn uids_with_unknown_signals(&self, mailbox_id: i64, limit: usize) -> Result<Vec<u32>> {
        let connection = self.read();
        let mut statement = connection
            .prepare_cached(
                "SELECT em.uid FROM email e JOIN email_mailbox em ON em.email_id = e.id
                 WHERE e.signals IS NULL AND em.mailbox_id = ?1 AND em.uid IS NOT NULL
                 ORDER BY em.uid DESC LIMIT ?2",
            )
            .storage()?;
        statement
            .query_map(params![mailbox_id, limit as i64], |row| row.get(0))
            .storage()?
            .collect::<rusqlite::Result<_>>()
            .storage()
    }

    /// Classifies again, from their headers fetched anew, the messages `asked` for; those the
    /// server no longer has keep their guess. Returns whether a thread changed category.
    pub fn reclassify(
        &self,
        account_id: &str,
        mailbox_id: i64,
        asked: &[u32],
        fetched: &[mail_model::FetchedMessage],
    ) -> Result<bool> {
        self.write(|transaction| {
            let account_email: String = transaction
                .query_row("SELECT email FROM account WHERE id = ?1", [account_id], |row| row.get(0))
                .storage()?;
            let mut find = transaction
                .prepare_cached(
                    "SELECT e.id, e.thread_id, e.category FROM email e JOIN email_mailbox em ON em.email_id = e.id
                     WHERE em.mailbox_id = ?1 AND em.uid = ?2",
                )
                .storage()?;
            let mut update = transaction
                .prepare_cached("UPDATE email SET category = ?2, signals = ?3 WHERE id = ?1")
                .storage()?;
            let mut touched = HashSet::new();
            for message in fetched {
                let Some((email_id, thread_id, previous)) = find
                    .query_row(params![mailbox_id, message.uid], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, Option<i64>>(2)?))
                    })
                    .optional()
                    .storage()?
                else {
                    continue;
                };
                let category = category_of(transaction, &account_email, &message.headers)?;
                update
                    .execute(params![email_id, category.code(), message.headers.signals.bits()])
                    .storage()?;
                if previous != Some(category.code()) {
                    touched.insert(thread_id);
                }
            }
            let mut forget = transaction
                .prepare_cached(
                    "UPDATE email SET signals = COALESCE(signals, 0) WHERE id IN (
                       SELECT email_id FROM email_mailbox WHERE mailbox_id = ?1 AND uid = ?2)",
                )
                .storage()?;
            for uid in asked {
                forget.execute(params![mailbox_id, uid]).storage()?;
            }
            refresh_threads(transaction, &touched)?;
            Ok(!touched.is_empty())
        })
    }

    /// Puts every message from `sender`, past and future, in `category`. Returns the mailboxes
    /// whose threads changed.
    pub fn set_sender_category(&self, sender: &str, category: Category) -> Result<Vec<i64>> {
        let sender = sender.trim().to_lowercase();
        self.write(|transaction| {
            transaction
                .execute(
                    "INSERT INTO sender_category (email, category) VALUES (?1, ?2)
                     ON CONFLICT (email) DO UPDATE SET category = excluded.category",
                    params![sender, category.code()],
                )
                .storage()?;
            transaction
                .execute(
                    "UPDATE email SET category = ?2 WHERE sender = ?1",
                    params![sender, category.code()],
                )
                .storage()?;
            let thread_ids: HashSet<i64> = transaction
                .prepare("SELECT DISTINCT thread_id FROM email WHERE sender = ?1")
                .storage()?
                .query_map([&sender], |row| row.get(0))
                .storage()?
                .collect::<rusqlite::Result<_>>()
                .storage()?;
            refresh_threads(transaction, &thread_ids)?;
            transaction
                .prepare(
                    "SELECT DISTINCT mt.mailbox_id FROM mailbox_thread mt
                     JOIN email e ON e.thread_id = mt.thread_id WHERE e.sender = ?1",
                )
                .storage()?
                .query_map([&sender], |row| row.get(0))
                .storage()?
                .collect::<rusqlite::Result<_>>()
                .storage()
        })
    }
}

#[cfg(test)]
mod tests {
    use mail_model::{
        Address, FetchedMessage, Flags, MailboxRole, RemoteMailbox, SendingSignals, ThreadScope,
    };

    use super::*;
    use crate::test_support;

    const LIST: SendingSignals = SendingSignals {
        bulk: true,
        automated: false,
        marketing: false,
        one_click: false,
    };

    fn message(
        uid: u32,
        from: &str,
        subject: &str,
        signals: SendingSignals,
        references: &[&str],
    ) -> FetchedMessage {
        FetchedMessage {
            uid,
            flags: Flags::default(),
            internal_date: Some(1_000 + i64::from(uid)),
            size: 100,
            headers: ParsedHeaders {
                message_id: Some(format!("m{uid}@x")),
                references: references.iter().map(|value| value.to_string()).collect(),
                subject: Some(subject.into()),
                from: vec![Address {
                    name: None,
                    email: from.into(),
                }],
                signals,
                ..ParsedHeaders::default()
            },
        }
    }

    fn setup() -> (Store, std::path::PathBuf, i64) {
        let (store, directory) = test_support::store();
        store
            .insert_account(&test_support::account("alice"))
            .unwrap();
        store
            .replace_mailboxes(
                "alice",
                &[RemoteMailbox {
                    remote_name: "INBOX".into(),
                    name: "INBOX".into(),
                    depth: 0,
                    role: Some(MailboxRole::Inbox),
                    selectable: true,
                }],
            )
            .unwrap();
        let inbox = store
            .mailbox_by_role("alice", MailboxRole::Inbox)
            .unwrap()
            .unwrap()
            .id;
        (store, directory, inbox)
    }

    fn subjects(store: &Store, category: Option<Category>) -> Vec<String> {
        let mut subjects: Vec<String> = store
            .list_threads(ThreadScope::Unified, false, category, None, 50)
            .unwrap()
            .threads
            .into_iter()
            .map(|thread| thread.latest.subject.unwrap())
            .collect();
        subjects.sort();
        subjects
    }

    #[test]
    fn messages_are_classified_when_stored_and_listed_by_category() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(
                        1,
                        "bob@example.com",
                        "Lunch tomorrow?",
                        SendingSignals::default(),
                        &[],
                    ),
                    message(
                        2,
                        "no-reply@shop.example",
                        "Your order has shipped",
                        SendingSignals::default(),
                        &[],
                    ),
                    message(3, "editor@weekly.example", "This week in Rust", LIST, &[]),
                    message(4, "deals@brand.example", "Black Friday: -40%", LIST, &[]),
                ],
            )
            .unwrap();
        assert_eq!(
            subjects(&store, Some(Category::Primary)),
            ["Lunch tomorrow?"]
        );
        assert_eq!(
            subjects(&store, Some(Category::Transactions)),
            ["Your order has shipped"]
        );
        assert_eq!(
            subjects(&store, Some(Category::Updates)),
            ["This week in Rust"]
        );
        assert_eq!(
            subjects(&store, Some(Category::Promotions)),
            ["Black Friday: -40%"]
        );
        assert_eq!(subjects(&store, None).len(), 4);
    }

    #[test]
    fn a_personal_reply_lifts_its_thread_to_primary() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(1, "editor@weekly.example", "This week in Rust", LIST, &[]),
                    message(
                        2,
                        "bob@example.com",
                        "Re: This week in Rust",
                        SendingSignals::default(),
                        &["m1@x"],
                    ),
                ],
            )
            .unwrap();
        let threads = store
            .list_threads(ThreadScope::Mailbox(inbox), false, None, None, 50)
            .unwrap()
            .threads;
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].category, Category::Primary);
        assert_eq!(
            threads[0].latest.subject.as_deref(),
            Some("Re: This week in Rust")
        );
    }

    #[test]
    fn programs_sending_in_the_users_name_are_not_primary() {
        let (store, _directory, inbox) = setup();
        let automated = SendingSignals {
            automated: true,
            ..SendingSignals::default()
        };
        // Having written to oneself does not make one's own address a correspondent.
        let alice = Address {
            name: None,
            email: "alice@example.com".into(),
        };
        store.record_sent(&[alice], 500).unwrap();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(
                        1,
                        "alice@example.com",
                        "Note to self",
                        SendingSignals::default(),
                        &[],
                    ),
                    message(
                        2,
                        "Alice@example.com",
                        "Your tokens will expire",
                        automated,
                        &[],
                    ),
                ],
            )
            .unwrap();
        assert_eq!(subjects(&store, Some(Category::Primary)), ["Note to self"]);
        assert_eq!(
            subjects(&store, Some(Category::Updates)),
            ["Your tokens will expire"]
        );
    }

    #[test]
    fn people_the_user_writes_to_stay_primary() {
        let (store, _directory, inbox) = setup();
        let editor = Address {
            name: None,
            email: "editor@weekly.example".into(),
        };
        store.record_sent(&[editor], 500).unwrap();
        store
            .insert_messages(
                "alice",
                inbox,
                &[message(1, "Editor@Weekly.example", "This week", LIST, &[])],
            )
            .unwrap();
        assert_eq!(subjects(&store, Some(Category::Primary)), ["This week"]);
    }

    #[test]
    fn moving_a_sender_moves_its_past_and_future_mail() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[message(1, "editor@weekly.example", "Issue 1", LIST, &[])],
            )
            .unwrap();
        let changed = store
            .set_sender_category("Editor@weekly.example", Category::Primary)
            .unwrap();
        assert_eq!(changed, [inbox]);
        store
            .insert_messages(
                "alice",
                inbox,
                &[message(2, "editor@weekly.example", "Issue 2", LIST, &[])],
            )
            .unwrap();
        assert_eq!(
            subjects(&store, Some(Category::Primary)),
            ["Issue 1", "Issue 2"]
        );
        assert!(subjects(&store, Some(Category::Updates)).is_empty());
    }

    #[test]
    fn only_primary_mail_is_notified() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(
                        1,
                        "bob@example.com",
                        "Lunch tomorrow?",
                        SendingSignals::default(),
                        &[],
                    ),
                    message(2, "deals@brand.example", "Black Friday: -40%", LIST, &[]),
                ],
            )
            .unwrap();
        let notified: Vec<_> = store
            .unread_inbox_emails_after("alice", (0, 0))
            .unwrap()
            .into_iter()
            .map(|message| message.email.subject.unwrap())
            .collect();
        assert_eq!(notified, ["Lunch tomorrow?"]);
    }

    #[test]
    fn older_inbox_mail_is_classified_again_from_its_headers() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(
                        1,
                        "editor@weekly.example",
                        "This week",
                        SendingSignals::default(),
                        &[],
                    ),
                    message(
                        2,
                        "bob@example.com",
                        "Lunch",
                        SendingSignals::default(),
                        &[],
                    ),
                ],
            )
            .unwrap();
        assert!(
            store
                .uids_with_unknown_signals(inbox, 50)
                .unwrap()
                .is_empty()
        );
        store
            .write(|transaction| {
                transaction
                    .execute_batch("UPDATE email SET signals = NULL")
                    .storage()
            })
            .unwrap();
        assert_eq!(store.uids_with_unknown_signals(inbox, 50).unwrap(), [2, 1]);
        let refetched = [message(1, "editor@weekly.example", "This week", LIST, &[])];
        assert!(
            store
                .reclassify("alice", inbox, &[2, 1], &refetched)
                .unwrap()
        );
        assert_eq!(subjects(&store, Some(Category::Updates)), ["This week"]);
        assert_eq!(subjects(&store, Some(Category::Primary)), ["Lunch"]);
        assert!(
            store
                .uids_with_unknown_signals(inbox, 50)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn new_rules_classify_stored_mail_again_without_its_headers() {
        let (store, directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[message(1, "editor@weekly.example", "This week", LIST, &[])],
            )
            .unwrap();
        drop(store);
        let path = directory.join("mail.db");
        // As an older classifier, with other rules, could have left it.
        Connection::open(&path)
            .unwrap()
            .execute_batch(
                "UPDATE email SET category = 3;
                 UPDATE mailbox_thread SET category = 3;
                 UPDATE store_setting SET value = value - 1 WHERE key = 'classifier'",
            )
            .unwrap();
        let store = Store::open(&path).unwrap();
        assert_eq!(subjects(&store, Some(Category::Updates)), ["This week"]);
        assert!(subjects(&store, Some(Category::Promotions)).is_empty());
        assert!(
            store
                .uids_with_unknown_signals(inbox, 50)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn colleagues_newsletters_are_primary_but_not_their_programs() {
        let (store, _directory, inbox) = setup();
        store
            .insert_messages(
                "alice",
                inbox,
                &[
                    message(
                        1,
                        "contact@example.com",
                        "Découvrez notre nouvelle offre",
                        LIST,
                        &[],
                    ),
                    message(2, "noreply@example.com", "Your build failed", LIST, &[]),
                ],
            )
            .unwrap();
        assert_eq!(
            subjects(&store, Some(Category::Primary)),
            ["Découvrez notre nouvelle offre"]
        );
        assert_eq!(
            subjects(&store, Some(Category::Updates)),
            ["Your build failed"]
        );
    }

    #[test]
    fn mail_stored_before_categories_is_classified_from_its_sender() {
        let directory = std::env::temp_dir().join(format!(
            "mail-store-categories-{}-{}",
            std::process::id(),
            mail_model::now_millis()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("mail.db");
        let connection = Connection::open(&path).unwrap();
        crate::migrate_with(&connection, &crate::MIGRATIONS[..5]).unwrap();
        connection
            .execute_batch(
                r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port,
                     imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
                   VALUES ('alice', 'alice@example.com', 'Alice', 'alice', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                 INSERT INTO mailbox (id, account_id, remote_name, name, role) VALUES (1, 'alice', 'INBOX', 'INBOX', 'inbox');
                 INSERT INTO thread (id, account_id, root) VALUES (1, 'alice', 'm1@x');
                 INSERT INTO email (id, account_id, thread_id, message_id, subject, from_json, to_json, cc_json,
                     reply_to_json, received_at)
                   VALUES (1, 'alice', 1, 'm1@x', 'Weekly digest',
                     '[{"name":null,"email":"NoReply@service.example"}]', '[]', '[]', '[]', 1000);
                 INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (1, 1, 1);
                 INSERT INTO mailbox_thread (mailbox_id, thread_id, account_id, unified, latest_email_id,
                     last_received_at, message_count, unread_count, is_flagged, has_attachment)
                   VALUES (1, 1, 'alice', 1, 1, 1000, 1, 1, 0, 0);"#,
            )
            .unwrap();
        drop(connection);
        let store = Store::open(&path).unwrap();
        assert_eq!(subjects(&store, Some(Category::Updates)), ["Weekly digest"]);
        assert!(subjects(&store, Some(Category::Primary)).is_empty());
    }
}
