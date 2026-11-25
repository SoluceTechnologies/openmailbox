use super::*;

#[test]
fn autoconfig_prefers_implicit_tls_and_expands_username() {
    let xml = r#"<clientConfig version="1.1"><emailProvider id="example.org">
            <incomingServer type="pop3"><hostname>pop.example.org</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
            <incomingServer type="imap"><hostname>imap.example.org</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></incomingServer>
            <incomingServer type="imap"><hostname>imap.example.org</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
            <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>
            <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>25</port><socketType>plain</socketType></outgoingServer>
        </emailProvider></clientConfig>"#;
    let config = parse_autoconfig(xml, "jane@example.org", "jane", "example.org").unwrap();
    assert_eq!(config.imap.port, 993);
    assert_eq!(
        config.smtp,
        ServerEndpoint {
            host: "smtp.example.org".into(),
            port: 587,
            security: Security::StartTls
        }
    );
    assert_eq!(config.username, "jane");
    assert_eq!(config.smtp_username, None);
}

#[test]
fn autoconfig_keeps_a_distinct_outgoing_username() {
    let xml = r#"<clientConfig version="1.1"><emailProvider id="example.org">
            <incomingServer type="imap"><hostname>imap.example.org</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
            <outgoingServer type="smtp"><hostname>smtp.example.org</hostname><port>465</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></outgoingServer>
        </emailProvider></clientConfig>"#;
    let config = parse_autoconfig(xml, "jane@example.org", "jane", "example.org").unwrap();
    assert_eq!(config.username, "jane");
    assert_eq!(config.smtp_username.as_deref(), Some("jane@example.org"));
}
