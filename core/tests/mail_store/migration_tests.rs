use super::*;

#[test]
fn a_version_one_database_keeps_its_search_index_after_migrating() {
    let directory =
        std::env::temp_dir().join(format!("mail-store-migration-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let _ = std::fs::remove_file(&path);
    {
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch(MIGRATIONS[0]).unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
        connection
                .execute_batch(
                    r#"INSERT INTO account VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                       INSERT INTO mailbox (id, account_id, remote_name, name, role) VALUES (1, 'a', 'INBOX', 'INBOX', 'inbox');
                       INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');
                       INSERT INTO email (id, account_id, thread_id, subject, from_json, to_json, cc_json, reply_to_json, received_at)
                         VALUES (7, 'a', 1, 'Facture de novembre', '[{"name":"Inès","email":"ines@x.org"}]', '[]', '[]', '[]', 1000);
                       INSERT INTO email_mailbox VALUES (1, 7, 3);
                       INSERT INTO email_fts (rowid, subject, participants, body) VALUES (7, 'Facture de novembre', 'Inès ines@x.org', NULL);"#,
                )
                .unwrap();
    }
    let store = Store::open(&path).unwrap();
    assert_eq!(
        store.account("a").unwrap().authentication,
        mail_model::Authentication::Password
    );
    assert_eq!(store.search("facture", 10, &[]).unwrap()[0].email.id, 7);
    assert_eq!(store.search("ines", 10, &[]).unwrap().len(), 1);
    store.remove_uids(1, &[3]).unwrap();
    assert!(store.search("facture", 10, &[]).unwrap().is_empty());
    std::fs::remove_dir_all(&directory).ok();
}
