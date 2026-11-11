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

    /// Addresses whose start, or the start of any word of their name, matches `query`; people
    /// written to rank above people only heard from, then the most recent first.
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
mod tests {
    use std::time::Instant;

    use mail_model::{Address, FetchedMessage, Flags, MailboxRole, ParsedHeaders, RemoteMailbox};

    use crate::test_support::{account, store};

    fn address(name: &str, email: &str) -> Address {
        Address {
            name: Some(name.into()),
            email: email.into(),
        }
    }

    fn emails(found: Vec<Address>) -> Vec<String> {
        found.into_iter().map(|address| address.email).collect()
    }

    fn receive(store: &crate::Store, uid: u32, from: Address, at: i64) {
        let inbox = store
            .mailbox_by_role("alice", MailboxRole::Inbox)
            .unwrap()
            .unwrap()
            .id;
        store
            .insert_messages(
                "alice",
                inbox,
                &[FetchedMessage {
                    uid,
                    flags: Flags::default(),
                    internal_date: Some(at),
                    size: 1,
                    headers: ParsedHeaders {
                        message_id: Some(format!("{uid}@x.org")),
                        from: vec![from],
                        ..ParsedHeaders::default()
                    },
                }],
            )
            .unwrap();
    }

    fn with_inbox() -> crate::Store {
        let (store, _) = store();
        store.insert_account(&account("alice")).unwrap();
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
        store
    }

    #[test]
    fn suggests_people_written_to_before_frequent_senders() {
        let store = with_inbox();
        for uid in 1..=4 {
            receive(&store, uid, address("Newsletter", "news@x.org"), 10);
        }
        receive(&store, 5, address("Nadia Benali", "nadia@x.org"), 20);
        store
            .record_sent(&[address("Nathan", "nathan@x.org")], 5)
            .unwrap();
        store
            .record_sent(&[address("Nadia Benali", "nadia@x.org")], 30)
            .unwrap();

        assert_eq!(
            emails(store.suggest_addresses("n", 8).unwrap()),
            vec!["nadia@x.org", "news@x.org", "nathan@x.org"]
        );
    }

    #[test]
    fn matches_address_prefix_and_any_word_of_the_name() {
        let store = with_inbox();
        receive(
            &store,
            1,
            address("Claire Dubois", "claire@atlas.example"),
            10,
        );
        receive(&store, 2, address("Alice", "alice@example.com"), 10);

        assert_eq!(
            emails(store.suggest_addresses("dub", 8).unwrap()),
            vec!["claire@atlas.example"]
        );
        assert_eq!(
            emails(store.suggest_addresses("CLA", 8).unwrap()),
            vec!["claire@atlas.example"]
        );
        assert!(store.suggest_addresses("alice", 8).unwrap().is_empty());
        assert!(store.suggest_addresses("tlas", 8).unwrap().is_empty());
    }

    #[test]
    fn a_query_with_wildcards_matches_them_literally() {
        let store = with_inbox();
        receive(&store, 1, address("Claire", "claire@atlas.example"), 10);
        assert!(store.suggest_addresses("%", 8).unwrap().is_empty());
        assert!(store.suggest_addresses("_laire", 8).unwrap().is_empty());
    }

    #[test]
    fn suggestions_stay_fast_on_large_mailboxes() {
        let store = with_inbox();
        let many: Vec<Address> = (0..20_000)
            .map(|index| {
                address(
                    &format!("Contact {index}"),
                    &format!("contact{index}@x.org"),
                )
            })
            .collect();
        store.record_sent(&many, 1).unwrap();

        let started = Instant::now();
        let found = store.suggest_addresses("contact19", 8).unwrap();
        assert_eq!(found.len(), 8);
        assert!(
            started.elapsed().as_millis() < 50,
            "took {:?}",
            started.elapsed()
        );
    }
}
