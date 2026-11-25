use super::*;

#[test]
fn a_database_from_the_first_notified_until_migration_gets_the_missing_column() {
    let directory = std::env::temp_dir().join(format!(
        "mail-store-notified-{}-{}",
        std::process::id(),
        mail_model::now_millis()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    {
        let connection = Connection::open(&path).unwrap();
        for migration in &MIGRATIONS[..4] {
            connection.execute_batch(migration).unwrap();
        }
        connection
                .execute_batch(
                    "ALTER TABLE account ADD COLUMN notified_until INTEGER NOT NULL DEFAULT 0;
                     INSERT INTO account VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0, 0);",
                )
                .unwrap();
        connection.pragma_update(None, "user_version", 5).unwrap();
    }

    let store = Store::open(&path).unwrap();

    store.set_notified_until("a", 1_000).unwrap();
    assert_eq!(store.notified_until("a").unwrap(), (1_000, 0));
}
