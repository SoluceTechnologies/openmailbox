use mail_model::Error;

use super::*;

#[test]
fn graph_takes_the_message_as_base64_mime() {
    assert_eq!(
        request_body(b"Subject: Hi\r\n\r\nBody"),
        "U3ViamVjdDogSGkNCg0KQm9keQ=="
    );
}

#[test]
fn graph_answers_become_sent_temporary_or_final() {
    assert!(send_result(202, "").is_ok());
    assert!(matches!(send_result(503, "<html>"), Err(Error::Network(_))));
    assert!(matches!(send_result(429, "{}"), Err(Error::Network(_))));
    let denied = r#"{"error":{"code":"ErrorAccessDenied","message":"Access is denied."}}"#;
    assert!(
        matches!(send_result(403, denied), Err(Error::Server(message)) if message == "Access is denied.")
    );
    assert!(
        matches!(send_result(413, "too big"), Err(Error::Server(message)) if message.contains("413"))
    );
}
