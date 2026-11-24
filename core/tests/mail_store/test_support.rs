use super::*;
use mail_model::{Account, Security, ServerEndpoint};

pub fn store() -> (Store, std::path::PathBuf) {
    let directory = std::env::temp_dir().join(format!("mail-store-test-{}", rand_suffix()));
    std::fs::create_dir_all(&directory).unwrap();
    let store = Store::open(&directory.join("mail.db")).unwrap();
    (store, directory)
}

fn rand_suffix() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    format!(
        "{}-{}-{}",
        std::process::id(),
        mail_model::now_millis(),
        COUNTER.fetch_add(1, Ordering::SeqCst)
    )
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
        authentication: mail_model::Authentication::Password,
        oauth_server: None,
    }
}
