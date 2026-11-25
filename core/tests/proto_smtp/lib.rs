use super::*;

#[test]
fn smtp_auth_disabled_is_a_server_error() {
    let disabled =
        "5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.";
    assert!(matches!(rejection(disabled.into()), Error::Server(message) if message == disabled));
    assert!(matches!(
        rejection("5.7.8 Username and Password not accepted".into()),
        Error::Auth
    ));
}
