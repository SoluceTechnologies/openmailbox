use super::*;

#[test]
fn text_written_without_spaces_is_indexed_again_once() {
    let directory =
        std::env::temp_dir().join(format!("mail-store-search-text-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let _ = std::fs::remove_file(&path);
    {
        let connection = Connection::open(&path).unwrap();
        migrate_with(&connection, MIGRATIONS).unwrap();
        connection
                .execute_batch(
                    r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
                         VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                       INSERT INTO mailbox (id, account_id, remote_name, name) VALUES (1, 'a', 'INBOX', 'Inbox');
                       INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');
                       INSERT INTO email (id, account_id, thread_id, subject, from_json, to_json, cc_json, reply_to_json, received_at, preview, search_key)
                         VALUES (7, 'a', 1, '会議のお知らせ', '[{"name":"山田太郎","email":"y@x.jp"}]', '[]', '[]', '[]', 1000, '明日は10時です', 70),
                                (8, 'a', 1, 'Facture', '[]', '[]', '[]', '[]', 2000, 'Bonjour', 80);
                       INSERT INTO email_mailbox (mailbox_id, email_id, uid) VALUES (1, 7, 7), (1, 8, 8);
                       INSERT INTO email_fts (rowid, subject, participants, body)
                         VALUES (70, '会議のお知らせ', '山田太郎 y@x.jp', '明日は10時です'), (80, 'Facture', '', 'Bonjour');"#,
                )
                .unwrap();
    }
    let store = Store::open(&path).unwrap();
    assert!(store.search("お知らせ", 10, &[]).unwrap().is_empty());
    while store.index_text_without_spaces().unwrap() {}
    assert!(!store.index_text_without_spaces().unwrap());
    assert_eq!(store.search("お知らせ", 10, &[]).unwrap()[0].email.id, 7);
    assert_eq!(store.search("太郎", 10, &[]).unwrap()[0].email.id, 7);
    assert_eq!(store.search("10時", 10, &[]).unwrap()[0].email.id, 7);
    assert_eq!(store.search("factu", 10, &[]).unwrap()[0].email.id, 8);
    std::fs::remove_dir_all(&directory).ok();
}
