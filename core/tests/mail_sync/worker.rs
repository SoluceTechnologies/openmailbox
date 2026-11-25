use super::*;

#[test]
fn only_a_microsoft_mailbox_refusing_smtp_auth_sends_through_graph() {
    let blocked = Error::Server("permanent error (535): 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Mailbox.".into());
    assert!(sends_through_graph(
        mail_model::Authentication::Microsoft,
        &blocked
    ));
    assert!(!sends_through_graph(
        mail_model::Authentication::Google,
        &blocked
    ));
    assert!(!sends_through_graph(
        mail_model::Authentication::Password,
        &blocked
    ));
    assert!(!sends_through_graph(
        mail_model::Authentication::Microsoft,
        &Error::Server("5.7.1 relay denied".into())
    ));
    assert!(!sends_through_graph(
        mail_model::Authentication::Microsoft,
        &Error::Auth
    ));
}

#[test]
fn two_copies_of_a_message_take_different_uids() {
    let mut claimed = HashSet::from([(1, 9)]);
    assert_eq!(newest_unclaimed(1, vec![4, 9], &mut claimed), Some(4));
    assert_eq!(newest_unclaimed(1, vec![4, 9], &mut claimed), None);
    assert_eq!(newest_unclaimed(2, vec![4, 9], &mut claimed), Some(9));
}

#[test]
fn a_summary_shows_the_preview_the_server_made() {
    let message = fetched_message(proto_imap::FetchedSummary {
        uid: 7,
        flags: Default::default(),
        internal_date: None,
        size: 2900,
        header: b"Subject: Hi\r\nContent-Type: text/html\r\n\r\n".to_vec(),
        text: Vec::new(),
        preview: Some("Lunch\r\n at noon?".into()),
    });
    assert_eq!(message.headers.preview.as_deref(), Some("Lunch at noon?"));
    assert_eq!(message.headers.subject.as_deref(), Some("Hi"));
}
