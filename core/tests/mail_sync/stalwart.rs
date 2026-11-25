use mail_model::{Security, ServerEndpoint};

#[tokio::test]
#[ignore = "needs tools/mail-server/mail-server.sh oauth"]
async fn stalwart_offers_what_an_open_mail_client_needs() {
    let imap = ServerEndpoint {
        host: "localhost".into(),
        port: 993,
        security: Security::Tls,
    };
    let configuration = proto_imap::oauth_configuration(&imap, "carol@example.com")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        configuration,
        "https://localhost/.well-known/openid-configuration"
    );
    let metadata = mail_auth::server::discover(&configuration).await.unwrap();
    assert_eq!(metadata.issuer, "https://localhost");
    let server = mail_auth::server::register(&metadata).await.unwrap();
    assert!(server.client_id.starts_with("swc1."));
    let (request, _) =
        mail_auth::oauth::begin_server(&server, "carol@example.com", &["localhost"]).unwrap();
    assert!(request.url.starts_with("https://localhost/login?"));
}

#[tokio::test]
#[ignore = "needs tools/mail-server/mail-server.sh oauth"]
async fn stalwart_sends_message_previews() {
    let imap = ServerEndpoint {
        host: "localhost".into(),
        port: 993,
        security: Security::Tls,
    };
    let mut connection = proto_imap::connect(
        &imap,
        "carol@example.com",
        &mail_model::Credential::Password("secret-password".into()),
    )
    .await
    .unwrap();
    assert!(connection.capabilities.preview);
    connection.select("INBOX").await.unwrap();
    let batch: Vec<u32> = connection
        .search_since(0)
        .await
        .unwrap()
        .into_iter()
        .take(50)
        .collect();
    let summaries = connection.fetch_summaries(&batch).await.unwrap();
    assert_eq!(summaries.len(), batch.len());
    assert!(summaries.iter().all(|summary| {
        summary.text.is_empty()
            && !summary.header.is_empty()
            && summary
                .preview
                .as_deref()
                .is_some_and(|preview| !preview.is_empty())
    }));
}
