use super::*;

#[test]
fn migration_fills_correspondents_from_existing_mail() {
    let directory = std::env::temp_dir().join(format!(
        "mail-store-correspondents-{}-{}",
        std::process::id(),
        mail_model::now_millis()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    {
        let connection = Connection::open(&path).unwrap();
        for migration in &MIGRATIONS[..2] {
            connection.execute_batch(migration).unwrap();
        }
        connection.pragma_update(None, "user_version", 2).unwrap();
        connection
                .execute_batch(
                    r#"INSERT INTO account VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
                       INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');
                       INSERT INTO email (id, account_id, thread_id, subject, from_json, to_json, cc_json, reply_to_json, received_at, search_key)
                         VALUES (7, 'a', 1, 'Facture', '[{"name":"Inès","email":"ines@x.org"}]', '[{"name":"A","email":"a@x.org"}]', '[]', '[]', 1000, 1),
                                (8, 'a', 1, 'Re: Facture', '[{"name":"A","email":"a@x.org"}]', '[{"name":"Paul","email":"paul@x.org"}]', '[]', '[]', 2000, 2);"#,
                )
                .unwrap();
    }
    let store = Store::open(&path).unwrap();
    let emails = |query| -> Vec<String> {
        store
            .suggest_addresses(query, 8)
            .unwrap()
            .into_iter()
            .map(|address| address.email)
            .collect()
    };
    assert_eq!(emails("ine"), vec!["ines@x.org"]);
    assert_eq!(emails("paul"), vec!["paul@x.org"]);
    assert!(emails("a@").is_empty());
    std::fs::remove_dir_all(&directory).ok();
}
