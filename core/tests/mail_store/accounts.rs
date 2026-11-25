use mail_model::{Authentication, Security, ServerConfig, ServerEndpoint};

use super::ACCOUNT_COLOR_COUNT;

use crate::test_support::{account, store};

#[test]
fn an_address_is_known_whatever_its_case() {
    let (store, directory) = store();
    store.insert_account(&account("alice")).unwrap();
    assert!(store.has_account_for("ALICE@example.com").unwrap());
    assert!(!store.has_account_for("bob@example.com").unwrap());
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn an_account_keeps_its_oauth_server() {
    let (store, directory) = store();
    let mut server = account("s");
    server.authentication = Authentication::Server;
    server.oauth_server = Some(mail_model::OAuthServer {
        issuer: "https://mail.example.org".into(),
        authorization_endpoint: "https://mail.example.org/login".into(),
        token_endpoint: "https://mail.example.org/auth/token".into(),
        client_id: "swc1.abc".into(),
    });
    store.insert_account(&server).unwrap();
    store.insert_account(&account("p")).unwrap();
    let stored = store.account("s").unwrap();
    assert_eq!(stored.authentication, Authentication::Server);
    assert_eq!(stored.oauth_server, server.oauth_server);
    assert_eq!(store.account("p").unwrap().oauth_server, None);
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn an_account_keeps_its_outgoing_username() {
    let (store, directory) = store();
    let mut separate = account("s");
    separate.smtp_username = Some("s-smtp".into());
    store.insert_account(&separate).unwrap();
    store.insert_account(&account("p")).unwrap();
    assert_eq!(
        store.account("s").unwrap().smtp_username.as_deref(),
        Some("s-smtp")
    );
    assert_eq!(store.account("p").unwrap().smtp_username, None);
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn an_account_keeps_how_it_signs_in() {
    let (store, directory) = store();
    let mut microsoft = account("m");
    microsoft.authentication = Authentication::Microsoft;
    store.insert_account(&microsoft).unwrap();
    store.insert_account(&account("p")).unwrap();
    assert_eq!(
        store.account("m").unwrap().authentication,
        Authentication::Microsoft
    );
    assert_eq!(
        store.account("p").unwrap().authentication,
        Authentication::Password
    );
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn a_new_account_gets_a_color_no_other_account_has() {
    let (store, directory) = store();
    for index in 0..ACCOUNT_COLOR_COUNT {
        let color = store.next_account_color().unwrap();
        assert!(color < ACCOUNT_COLOR_COUNT);
        let mut next = account(&format!("a{index}"));
        next.color = color;
        store.insert_account(&next).unwrap();
    }
    let mut colors: Vec<u32> = store
        .list_accounts()
        .unwrap()
        .iter()
        .map(|account| account.color)
        .collect();
    colors.sort();
    assert_eq!(colors, (0..ACCOUNT_COLOR_COUNT).collect::<Vec<_>>());
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn a_removed_account_gives_its_color_back() {
    let (store, directory) = store();
    for index in 0..ACCOUNT_COLOR_COUNT {
        let mut next = account(&format!("a{index}"));
        next.color = index;
        store.insert_account(&next).unwrap();
    }
    store.delete_account("a5").unwrap();
    assert_eq!(store.next_account_color().unwrap(), 5);
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn an_account_keeps_the_color_chosen_for_it() {
    let (store, directory) = store();
    store.insert_account(&account("a")).unwrap();
    store.set_account_color("a", 7).unwrap();
    assert_eq!(store.account("a").unwrap().color, 7);
    store
        .set_account_color("a", ACCOUNT_COLOR_COUNT + 2)
        .unwrap();
    assert_eq!(store.account("a").unwrap().color, 2);
    std::fs::remove_dir_all(directory).ok();
}

#[test]
fn an_account_takes_new_server_settings() {
    let (store, directory) = store();
    store.insert_account(&account("a")).unwrap();
    let servers = ServerConfig {
        imap: ServerEndpoint {
            host: "mail.example.org".into(),
            port: 143,
            security: Security::StartTls,
        },
        smtp: ServerEndpoint {
            host: "smtp.example.org".into(),
            port: 587,
            security: Security::StartTls,
        },
        username: "a@example.org".into(),
        smtp_username: Some("a-smtp".into()),
    };
    store.update_servers("a", &servers).unwrap();
    let stored = store.account("a").unwrap();
    assert_eq!(stored.imap, servers.imap);
    assert_eq!(stored.smtp, servers.smtp);
    assert_eq!(stored.username, "a@example.org");
    assert_eq!(stored.smtp_username.as_deref(), Some("a-smtp"));
    assert_eq!(stored.email, "a@example.com");
    std::fs::remove_dir_all(directory).ok();
}
