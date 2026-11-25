use super::*;

#[test]
fn cached_html_bodies_are_rendered_again_after_migrating() {
    let directory =
        std::env::temp_dir().join(format!("mail-store-cached-html-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let _ = std::fs::remove_file(&path);
    {
        let connection = Connection::open(&path).unwrap();
        migrate_with(&connection, &MIGRATIONS[..9]).unwrap();
        connection
                .execute_batch(
                    r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
                         VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                       INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');
                       INSERT INTO email (id, account_id, thread_id, from_json, to_json, cc_json, reply_to_json, received_at, body_state)
                         VALUES (7, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2), (8, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2);
                       INSERT INTO email_body (email_id, html, text, attachments_json, has_remote_content)
                         VALUES (7, 'Weekly deals<p>Hello</p>', 'Hello', '[]', 0), (8, NULL, 'Plain', '[]', 0);"#,
                )
                .unwrap();
    }
    let store = Store::open(&path).unwrap();
    assert!(store.body(7).unwrap().is_none());
    assert_eq!(store.body(8).unwrap().unwrap().text, "Plain");
    std::fs::remove_dir_all(&directory).ok();
}
