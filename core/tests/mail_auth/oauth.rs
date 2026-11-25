use std::collections::HashMap;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use mail_model::{Authentication, Error, OAuthServer, Security};

use super::*;

fn query(url: &str) -> HashMap<String, String> {
    url::Url::parse(url)
        .unwrap()
        .query_pairs()
        .into_owned()
        .collect()
}

fn scopes(query: &HashMap<String, String>) -> Vec<String> {
    query["scope"].split(' ').map(str::to_owned).collect()
}

#[test]
fn microsoft_request_uses_pkce_and_hint() {
    let (request, pending) = begin(Authentication::Microsoft, Some("alice@outlook.com")).unwrap();
    let url = url::Url::parse(&request.url).unwrap();
    assert_eq!(url.host_str(), Some("login.microsoftonline.com"));
    assert_eq!(url.path(), "/common/oauth2/v2.0/authorize");
    let query = query(&request.url);
    assert_eq!(query["client_id"], "37493326-2866-414d-bc1b-58b84101bac1");
    assert_eq!(query["redirect_uri"], "openmailbox://oauth");
    assert_eq!(request.redirect_uri, "openmailbox://oauth");
    assert_eq!(query["response_type"], "code");
    assert_eq!(query["code_challenge_method"], "S256");
    let digest = ring::digest::digest(&ring::digest::SHA256, pending.verifier.as_bytes());
    assert_eq!(query["code_challenge"], URL_SAFE_NO_PAD.encode(digest));
    assert_eq!(query["prompt"], "select_account");
    assert_eq!(query["login_hint"], "alice@outlook.com");
    assert_eq!(query["state"], pending.state);
    assert!(scopes(&query).contains(&"offline_access".to_owned()));
    assert!(
        scopes(&query).contains(&"https://outlook.office.com/IMAP.AccessAsUser.All".to_owned())
    );
    assert!(scopes(&query).contains(&"https://outlook.office.com/SMTP.Send".to_owned()));
    assert!(pending.verifier.len() >= 43);
    let (again, other) = begin(Authentication::Microsoft, None).unwrap();
    assert_ne!(other.state, pending.state);
    assert!(!self::query(&again.url).contains_key("login_hint"));
}

#[test]
fn google_request_asks_offline_mail_access() {
    let (request, _) = begin(Authentication::Google, None).unwrap();
    let url = url::Url::parse(&request.url).unwrap();
    assert_eq!(url.host_str(), Some("accounts.google.com"));
    assert_eq!(url.path(), "/o/oauth2/v2/auth");
    let query = query(&request.url);
    assert!(scopes(&query).contains(&"https://mail.google.com/".to_owned()));
    assert_eq!(query["access_type"], "offline");
    assert!(query["client_id"].ends_with(".apps.googleusercontent.com"));
    assert!(matches!(
        begin(Authentication::Password, None),
        Err(Error::InvalidInput(_))
    ));
}

#[test]
fn callback_checks_state() {
    let (_, pending) = begin(Authentication::Microsoft, None).unwrap();
    let state = &pending.state;
    assert_eq!(
        authorization_code(
            &format!("openmailbox://oauth?code=abc&state={state}"),
            &pending
        )
        .unwrap(),
        "abc"
    );
    assert!(matches!(
        authorization_code("openmailbox://oauth?code=abc&state=other", &pending),
        Err(Error::InvalidInput(_))
    ));
    assert!(matches!(
        authorization_code(
            &format!("openmailbox://oauth?error=access_denied&error_subcode=cancel&state={state}"),
            &pending
        ),
        Err(Error::Cancelled)
    ));
    assert!(matches!(
        authorization_code(
            &format!("openmailbox://oauth?error=consent_required&error_description=Need%20admin&state={state}"),
            &pending
        ),
        Err(Error::Server(message)) if message == "Need admin"
    ));
}

fn id_token(claims: &str) -> String {
    format!("e30.{}.signature", URL_SAFE_NO_PAD.encode(claims))
}

#[test]
fn grant_reads_tokens_and_identity() {
    let microsoft = serde_json::json!({
        "access_token": "at",
        "refresh_token": "rt",
        "expires_in": 3600,
        "id_token": id_token(r#"{"preferred_username":"a@outlook.com","name":"A","tid":"9188040d-6c67-4c5b-b112-36a304b66dad"}"#),
    });
    let grant = parse_grant(200, &microsoft.to_string(), 1_000).unwrap();
    assert_eq!(grant.access_token, "at");
    assert_eq!(grant.refresh_token.as_deref(), Some("rt"));
    assert_eq!(grant.expires_at, 1_000 + 3_600_000);
    let identity = grant.identity.unwrap();
    assert_eq!(identity.email, "a@outlook.com");
    assert_eq!(identity.name.as_deref(), Some("A"));
    assert_eq!(identity.tenant.as_deref(), Some(PERSONAL_TENANT));

    let google = serde_json::json!({
        "access_token": "at",
        "expires_in": 3599,
        "id_token": id_token(r#"{"email":"b@gmail.com","name":"B"}"#),
    });
    let grant = parse_grant(200, &google.to_string(), 0).unwrap();
    assert_eq!(grant.identity.unwrap().email, "b@gmail.com");
    assert_eq!(grant.refresh_token, None);

    assert!(matches!(
        parse_grant(
            400,
            r#"{"error":"invalid_grant","error_description":"expired"}"#,
            0
        ),
        Err(Error::Auth)
    ));
    assert!(matches!(
        parse_grant(400, r#"{"error":"invalid_client","error_description":"bad client"}"#, 0),
        Err(Error::Server(message)) if message == "bad client"
    ));
}

#[test]
fn token_endpoint_trouble_is_temporary() {
    assert!(matches!(
        parse_grant(503, "<html>Service Unavailable</html>", 0),
        Err(Error::Network(_))
    ));
    assert!(matches!(parse_grant(429, "{}", 0), Err(Error::Network(_))));
    let unreadable = r#"{"access_token":"secret-at","expires_in":"soon"}"#;
    match parse_grant(200, unreadable, 0) {
        Err(Error::Network(message)) => assert!(!message.contains("secret-at")),
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn a_refresh_the_provider_refuses_needs_a_new_sign_in() {
    for error in [
        "invalid_grant",
        "interaction_required",
        "consent_required",
        "login_required",
    ] {
        let body = format!(r#"{{"error":"{error}","error_description":"sign in"}}"#);
        assert!(
            matches!(parse_grant(400, &body, 0), Err(Error::Auth)),
            "{error}"
        );
    }
}

#[test]
fn microsoft_refreshes_name_the_mail_scopes() {
    let scope = |form: Vec<(&str, String)>| {
        form.into_iter()
            .find(|(name, _)| *name == "scope")
            .map(|(_, value)| value)
    };
    let microsoft = scope(refresh_form(Authentication::Microsoft, "rt")).unwrap();
    assert!(microsoft.contains("https://outlook.office.com/IMAP.AccessAsUser.All"));
    assert!(microsoft.contains("offline_access"));
    assert_eq!(scope(refresh_form(Authentication::Google, "rt")), None);
}

fn form_value(form: &[(&str, String)], name: &str) -> Option<String> {
    form.iter()
        .find(|(key, _)| *key == name)
        .map(|(_, value)| value.clone())
}

#[test]
fn microsoft_sign_in_also_asks_to_send_through_graph() {
    let (request, pending) = begin(Authentication::Microsoft, None).unwrap();
    assert!(scopes(&query(&request.url)).contains(&GRAPH_SEND_SCOPE.to_owned()));
    let exchange = form_value(&exchange_form(&pending, "code"), "scope").unwrap();
    assert!(exchange.contains("https://outlook.office.com/IMAP.AccessAsUser.All"));
    assert!(!exchange.contains("graph.microsoft.com"));
    let (_, google) = begin(Authentication::Google, None).unwrap();
    assert_eq!(form_value(&exchange_form(&google, "code"), "scope"), None);
}

#[test]
fn a_graph_token_is_redeemed_for_mail_send_only() {
    let form = graph_refresh_form("rt");
    assert_eq!(
        form_value(&form, "grant_type").as_deref(),
        Some("refresh_token")
    );
    assert_eq!(form_value(&form, "refresh_token").as_deref(), Some("rt"));
    assert_eq!(
        form_value(&form, "scope").as_deref(),
        Some("https://graph.microsoft.com/Mail.Send offline_access")
    );
}

fn stalwart() -> OAuthServer {
    OAuthServer {
        issuer: "https://mail.example.org".into(),
        authorization_endpoint: "https://mail.example.org/login".into(),
        token_endpoint: "https://mail.example.org/auth/token".into(),
        client_id: "swc1.abc".into(),
    }
}

#[test]
fn a_server_sign_in_asks_for_mail_consent_on_every_mail_host() {
    let (request, pending) = begin_server(
        &stalwart(),
        "alice@example.org",
        &["imap.example.org", "smtp.example.org"],
    )
    .unwrap();
    let url = url::Url::parse(&request.url).unwrap();
    assert_eq!(url.host_str(), Some("mail.example.org"));
    assert_eq!(url.path(), "/login");
    let pairs: Vec<(String, String)> = url.query_pairs().into_owned().collect();
    let value = |name: &str| {
        pairs
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    };
    assert_eq!(value("client_id").as_deref(), Some("swc1.abc"));
    assert_eq!(
        value("redirect_uri").as_deref(),
        Some("com.soluce.openmailbox:/oauth")
    );
    assert_eq!(request.redirect_uri, "com.soluce.openmailbox:/oauth");
    assert_eq!(
        value("scope").as_deref(),
        Some("urn:ietf:params:oauth:scope:mail openid offline_access")
    );
    assert_eq!(value("prompt").as_deref(), Some("consent"));
    assert_eq!(value("login_hint").as_deref(), Some("alice@example.org"));
    assert_eq!(value("code_challenge_method").as_deref(), Some("S256"));
    let resources: Vec<String> = pairs
        .iter()
        .filter(|(key, _)| key == "resource")
        .map(|(_, value)| value.clone())
        .collect();
    assert_eq!(resources, vec!["imap.example.org", "smtp.example.org"]);
    assert_eq!(pending.provider, Authentication::Server);
    assert_eq!(pending.server, Some(stalwart()));
}

#[test]
fn a_server_answer_must_come_from_its_issuer() {
    let (_, pending) = begin_server(&stalwart(), "alice@example.org", &[]).unwrap();
    let state = &pending.state;
    let callback = |iss: &str| format!("com.soluce.openmailbox:/oauth?code=abc&state={state}{iss}");
    assert_eq!(
        authorization_code(&callback("&iss=https%3A%2F%2Fmail.example.org"), &pending).unwrap(),
        "abc"
    );
    assert!(matches!(
        authorization_code(&callback("&iss=https%3A%2F%2Fevil.example"), &pending),
        Err(Error::InvalidInput(_))
    ));
    assert!(matches!(
        authorization_code(&callback(""), &pending),
        Err(Error::InvalidInput(_))
    ));
}

#[test]
fn the_token_username_names_the_account() {
    let grant = parse_grant(
        200,
        r#"{"access_token":"at","refresh_token":"rt","username":"alice@example.org"}"#,
        0,
    )
    .unwrap();
    assert_eq!(grant.identity.unwrap().email, "alice@example.org");
}

#[test]
fn a_server_account_renews_at_its_own_token_endpoint() {
    let server = stalwart();
    assert_eq!(
        token_target(Authentication::Server, Some(&server)).unwrap(),
        (
            "https://mail.example.org/auth/token".to_owned(),
            "swc1.abc".to_owned()
        )
    );
    assert!(matches!(
        token_target(Authentication::Server, None),
        Err(Error::InvalidInput(_))
    ));
    assert_eq!(
        token_target(Authentication::Microsoft, None).unwrap().0,
        "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    );
}

#[test]
fn servers_follow_the_tenant() {
    let identity = |tenant: Option<&str>| Identity {
        email: "a@contoso.com".into(),
        name: None,
        tenant: tenant.map(str::to_owned),
    };
    let personal = servers(Authentication::Microsoft, &identity(Some(PERSONAL_TENANT)));
    assert_eq!(personal.imap.host, "outlook.office365.com");
    assert_eq!(personal.imap.port, 993);
    assert_eq!(personal.smtp.host, "smtp-mail.outlook.com");
    assert_eq!(personal.smtp.port, 587);
    assert_eq!(personal.smtp.security, Security::StartTls);
    assert_eq!(personal.username, "a@contoso.com");
    let work = servers(Authentication::Microsoft, &identity(Some("72f988bf-0000")));
    assert_eq!(work.smtp.host, "smtp.office365.com");
    let google = servers(Authentication::Google, &identity(None));
    assert_eq!(
        (google.imap.host.as_str(), google.imap.port),
        ("imap.gmail.com", 993)
    );
    assert_eq!(
        (google.smtp.host.as_str(), google.smtp.port),
        ("smtp.gmail.com", 465)
    );
    assert_eq!(google.smtp.security, Security::Tls);
}
