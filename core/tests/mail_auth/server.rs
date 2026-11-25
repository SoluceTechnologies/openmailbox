use mail_model::Error;

use super::*;

fn metadata(overrides: serde_json::Value) -> String {
    let mut document = serde_json::json!({
        "issuer": "https://mail.example.org",
        "authorization_endpoint": "https://mail.example.org/login",
        "token_endpoint": "https://mail.example.org/auth/token",
        "registration_endpoint": "https://mail.example.org/auth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none"],
        "code_challenge_methods_supported": ["S256"],
        "authorization_response_iss_parameter_supported": true,
        "scopes_supported": ["openid", "offline_access", "urn:ietf:params:oauth:scope:mail"]
    });
    for (key, value) in overrides.as_object().unwrap() {
        document[key] = value.clone();
    }
    document.to_string()
}

#[test]
fn only_hosts_of_the_oauth_server_are_named_as_resources() {
    assert_eq!(
        served_resources(
            "https://mail.example.org",
            &["MAIL.example.org", "mail.example.org"]
        ),
        vec!["mail.example.org"]
    );
    assert!(served_resources("https://localhost", &["10.0.2.2", "imap.example.org"]).is_empty());
    assert!(served_resources("not a url", &["mail.example.org"]).is_empty());
}

#[test]
fn metadata_lives_at_the_rfc_8414_address() {
    assert_eq!(
        metadata_url("https://mail.example.org").unwrap(),
        "https://mail.example.org/.well-known/oauth-authorization-server"
    );
    assert_eq!(
        metadata_url("https://example.org/tenant").unwrap(),
        "https://example.org/.well-known/oauth-authorization-server/tenant"
    );
    assert_eq!(
        openid_configuration_url("https://example.org/tenant"),
        "https://example.org/tenant/.well-known/openid-configuration"
    );
    assert_eq!(
        openid_configuration_url("https://example.org/"),
        "https://example.org/.well-known/openid-configuration"
    );
}

#[test]
fn an_issuer_must_be_plain_https() {
    assert!(check_issuer("https://mail.example.org").is_ok());
    for issuer in [
        "http://mail.example.org",
        "https://mail.example.org/?tenant=1",
        "https://mail.example.org/#top",
        "https://alice@mail.example.org",
        "mail.example.org",
    ] {
        assert!(
            matches!(check_issuer(issuer), Err(Error::InvalidInput(_))),
            "{issuer}"
        );
    }
}

#[test]
fn metadata_follows_the_open_public_client_profile() {
    let accepted =
        parse_metadata(&metadata(serde_json::json!({})), "https://mail.example.org").unwrap();
    assert_eq!(
        accepted.token_endpoint,
        "https://mail.example.org/auth/token"
    );
    assert_eq!(
        accepted.registration_endpoint,
        "https://mail.example.org/auth/register"
    );
    for refused in [
        serde_json::json!({"issuer": "https://evil.example"}),
        serde_json::json!({"token_endpoint": "http://mail.example.org/auth/token"}),
        serde_json::json!({"code_challenge_methods_supported": ["plain"]}),
        serde_json::json!({"authorization_response_iss_parameter_supported": false}),
        serde_json::json!({"token_endpoint_auth_methods_supported": ["client_secret_basic"]}),
        serde_json::json!({"registration_endpoint": null}),
    ] {
        assert!(
            parse_metadata(&metadata(refused.clone()), "https://mail.example.org").is_err(),
            "{refused}"
        );
    }
}

#[test]
fn registration_asks_for_a_public_mail_client() {
    let body = registration_body();
    assert_eq!(
        body["redirect_uris"],
        serde_json::json!(["com.soluce.openmailbox:/oauth"])
    );
    assert_eq!(body["token_endpoint_auth_method"], "none");
    assert_eq!(
        body["grant_types"],
        serde_json::json!(["authorization_code", "refresh_token"])
    );
    assert_eq!(body["response_types"], serde_json::json!(["code"]));
    assert_eq!(
        body["scope"],
        "urn:ietf:params:oauth:scope:mail openid offline_access"
    );
    assert_eq!(body["client_name"], "Open Mailbox");
}

#[test]
fn a_registration_answer_must_keep_our_redirect_and_mail_scope() {
    let answer = |overrides: serde_json::Value| {
        let mut document = serde_json::json!({
            "client_id": "swc1.abc",
            "redirect_uris": ["com.soluce.openmailbox:/oauth"],
            "scope": "urn:ietf:params:oauth:scope:mail openid offline_access"
        });
        for (key, value) in overrides.as_object().unwrap() {
            document[key] = value.clone();
        }
        document.to_string()
    };
    assert_eq!(
        parse_registration(201, &answer(serde_json::json!({}))).unwrap(),
        "swc1.abc"
    );
    assert!(
        parse_registration(
            201,
            &answer(serde_json::json!({"redirect_uris": ["com.other:/cb"]}))
        )
        .is_err()
    );
    assert!(parse_registration(201, &answer(serde_json::json!({"scope": "openid"}))).is_err());
    assert!(parse_registration(201, &answer(serde_json::json!({"client_id": null}))).is_err());
    assert!(matches!(
        parse_registration(400, r#"{"error":"invalid_redirect_uri","error_description":"no"}"#),
        Err(Error::Server(message)) if message == "no"
    ));
}
