use mail_model::RenderedBody;

use super::*;

fn fresh_path(name: &str) -> std::path::PathBuf {
    let directory = std::env::temp_dir().join(format!("mail-store-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let _ = std::fs::remove_file(&path);
    path
}

const SEED: &str = r#"INSERT INTO account (id, email, display_name, username, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, color, created_at)
     VALUES ('a', 'a@x.org', 'A', 'a', 'h', 993, 'tls', 'h', 465, 'tls', 0, 0);
   INSERT INTO thread (id, account_id, root) VALUES (1, 'a', 'r@x');
   INSERT INTO email (id, account_id, thread_id, from_json, to_json, cc_json, reply_to_json, received_at, body_state)
     VALUES (7, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2), (8, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2),
            (9, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2), (10, 'a', 1, '[]', '[]', '[]', '[]', 1000, 2);"#;

#[test]
fn drops_only_cached_invitation_bodies() {
    let path = fresh_path("cached-invitation");
    {
        let connection = Connection::open(&path).unwrap();
        migrate_with(&connection, &MIGRATIONS[..15]).unwrap();
        connection.execute_batch(SEED).unwrap();
        connection
            .execute_batch(
                r#"INSERT INTO email_body (email_id, html, text, attachments_json, has_remote_content) VALUES
                     (7, NULL, 'Invite', '[{"index":0,"filename":"attachment-1","mime_type":"text/calendar","size":10}]', 0),
                     (8, NULL, 'Invite', '[{"index":0,"filename":"invite.ics","mime_type":"application/ics","size":10}]', 0),
                     (9, NULL, 'Invite', '[{"index":0,"filename":"Meeting.ICS","mime_type":"application/octet-stream","size":10}]', 0),
                     (10, NULL, 'Quote', '[{"index":0,"filename":"quote.pdf","mime_type":"application/pdf","size":10}]', 0);"#,
            )
            .unwrap();
    }
    let store = Store::open(&path).unwrap();
    assert!(store.body(7).unwrap().is_none());
    assert!(store.body(8).unwrap().is_none());
    assert!(store.body(9).unwrap().is_none());
    assert_eq!(store.body(10).unwrap().unwrap().text, "Quote");
    std::fs::remove_dir_all(path.parent().unwrap()).ok();
}

#[test]
fn keeps_the_invitation_with_the_cached_body() {
    let path = fresh_path("invitation-roundtrip");
    let store = Store::open(&path).unwrap();
    store
        .write(|transaction| transaction.execute_batch(SEED).storage())
        .unwrap();
    let body = RenderedBody {
        html: None,
        text: "Invite".into(),
        bcc: Vec::new(),
        has_remote_content: false,
        attachments: Vec::new(),
        unsubscribe: None,
        calendar: Some("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n".into()),
    };
    store.save_body(7, &body).unwrap();
    assert_eq!(store.body(7).unwrap().unwrap().calendar, body.calendar);
    std::fs::remove_dir_all(path.parent().unwrap()).ok();
}

#[test]
fn keeps_the_hidden_recipients_with_the_cached_body() {
    let path = fresh_path("bcc-roundtrip");
    let store = Store::open(&path).unwrap();
    store
        .write(|transaction| transaction.execute_batch(SEED).storage())
        .unwrap();
    let carol = mail_model::Address {
        name: Some("Carol".into()),
        email: "carol@example.org".into(),
    };
    let body = RenderedBody {
        html: None,
        text: "Draft".into(),
        bcc: vec![carol.clone()],
        has_remote_content: false,
        attachments: Vec::new(),
        unsubscribe: None,
        calendar: None,
    };
    store.save_body(7, &body).unwrap();
    assert_eq!(store.body(7).unwrap().unwrap().bcc, vec![carol]);
    std::fs::remove_dir_all(path.parent().unwrap()).ok();
}
