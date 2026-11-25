use super::*;

#[test]
fn mail_stored_with_undecoded_charsets_is_fetched_again_once() {
    let directory =
        std::env::temp_dir().join(format!("mail-store-undecoded-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let _ = std::fs::remove_file(&path);
    let insert = |connection: &Connection, id: i64, mailbox: i64, subject: &str, from: &str| {
        connection
                .execute(
                    "INSERT INTO email (id, account_id, thread_id, subject, from_json, to_json, cc_json, reply_to_json, received_at)
                       VALUES (?1, 'a', 1, ?2, ?3, '[]', '[]', '[]', 1000);",
                    rusqlite::params![id, subject, from],
                )
                .unwrap();
        connection
            .execute(
                "INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (?1, ?2, ?2)",
                [mailbox, id],
            )
            .unwrap();
    };
    {
        let connection = Connection::open(&path).unwrap();
        migrate_with(&connection, MIGRATIONS).unwrap();
        connection
                .execute_batch(
                    r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
                         VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                       INSERT INTO mailbox (id, account_id, remote_name, name, synced_at)
                         VALUES (1, 'a', 'INBOX', 'Inbox', 5), (2, 'a', 'Sent', 'Sent', 5), (3, 'a', 'Archive', 'Archive', 5);
                       INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');"#,
                )
                .unwrap();
        insert(&connection, 7, 1, "\u{1b}$B2q5D\u{1b}(B", "[]");
        insert(
            &connection,
            8,
            2,
            "Hello",
            r#"[{"name":"\u001b$B;3ED\u001b(B","email":"y@x.jp"}]"#,
        );
        insert(&connection, 9, 3, "Caf\u{e9}", "[]");
        insert(&connection, 10, 3, "\u{fffd}\u{fffd}", "[]");
    }
    let store = Store::open(&path).unwrap();
    assert!(store.local_uids(1).unwrap().is_empty());
    assert!(store.local_uids(2).unwrap().is_empty());
    assert_eq!(store.local_uids(3).unwrap(), [9]);
    assert_eq!(store.mailbox_sync_state(1).unwrap().synced_at, None);
    assert_eq!(store.mailbox_sync_state(3).unwrap().synced_at, None);

    drop(store);
    insert(&Connection::open(&path).unwrap(), 11, 1, "\u{fffd}", "[]");
    let store = Store::open(&path).unwrap();
    assert_eq!(store.local_uids(1).unwrap(), [11]);
    std::fs::remove_dir_all(&directory).ok();
}
