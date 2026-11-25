use mail_model::{Account, Authentication, Security, ServerEndpoint};
use mail_store::Store;

pub fn store() -> Store {
    let directory = std::env::temp_dir().join(format!(
        "mail-sync-test-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    Store::open(&directory.join("mail.db")).unwrap()
}

pub fn account(id: &str) -> Account {
    let endpoint = ServerEndpoint {
        host: "imap.example.com".into(),
        port: 993,
        security: Security::Tls,
    };
    Account {
        id: id.into(),
        email: format!("{id}@example.com"),
        display_name: id.into(),
        username: id.into(),
        smtp_username: None,
        imap: endpoint.clone(),
        smtp: endpoint,
        color: 0,
        created_at: 0,
        authentication: Authentication::Password,
        oauth_server: None,
    }
}
