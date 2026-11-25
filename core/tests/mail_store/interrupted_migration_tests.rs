use super::*;

fn user_version(connection: &Connection) -> i64 {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn a_migration_stopped_halfway_runs_again_from_its_start() {
    let connection = Connection::open_in_memory().unwrap();
    let stopped = [
        "CREATE TABLE a (x INTEGER);",
        "ALTER TABLE a ADD COLUMN y INTEGER; SELECT * FROM missing;",
    ];
    assert!(migrate_with(&connection, &stopped).is_err());
    assert_eq!(user_version(&connection), 1);

    let complete = [
        "CREATE TABLE a (x INTEGER);",
        "ALTER TABLE a ADD COLUMN y INTEGER;",
    ];
    migrate_with(&connection, &complete).unwrap();
    assert_eq!(user_version(&connection), 2);
}
