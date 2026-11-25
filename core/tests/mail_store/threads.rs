use mail_model::{
    Address, FetchedMessage, Flags, Keyword, MailboxRole, ParsedHeaders, RemoteMailbox,
    RenderedBody, ThreadFilter,
};

use super::*;
use crate::test_support;

fn message(
    uid: u32,
    message_id: &str,
    references: &[&str],
    received_at: i64,
    seen: bool,
) -> FetchedMessage {
    FetchedMessage {
        uid,
        flags: Flags {
            seen,
            ..Flags::default()
        },
        internal_date: Some(received_at),
        size: 100,
        headers: ParsedHeaders {
            message_id: Some(message_id.into()),
            references: references.iter().map(|value| value.to_string()).collect(),
            subject: Some(format!("Subject {uid}")),
            from: vec![Address {
                name: Some("Bob".into()),
                email: "bob@example.com".into(),
            }],
            preview: Some(format!("preview of {message_id}")),
            ..ParsedHeaders::default()
        },
    }
}

fn setup() -> (Store, std::path::PathBuf, i64, i64) {
    let (store, directory) = test_support::store();
    store
        .insert_account(&test_support::account("alice"))
        .unwrap();
    let mailbox = |name: &str, role| RemoteMailbox {
        remote_name: name.into(),
        name: name.into(),
        depth: 0,
        role: Some(role),
        selectable: true,
    };
    store
        .replace_mailboxes(
            "alice",
            &[
                mailbox("INBOX", MailboxRole::Inbox),
                mailbox("Trash", MailboxRole::Trash),
            ],
        )
        .unwrap();
    let inbox = store
        .mailbox_by_role("alice", MailboxRole::Inbox)
        .unwrap()
        .unwrap()
        .id;
    let trash = store
        .mailbox_by_role("alice", MailboxRole::Trash)
        .unwrap()
        .unwrap()
        .id;
    (store, directory, inbox, trash)
}

#[test]
fn replies_are_grouped_in_one_thread_and_pages_follow_the_cursor() {
    let (store, _directory, inbox, _) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "root@x", &[], 1_000, true),
                message(2, "reply@x", &["root@x"], 3_000, false),
                message(3, "other@x", &[], 2_000, false),
            ],
        )
        .unwrap();

    let first_page = store
        .list_threads(
            ThreadScope::Unified,
            &ThreadFilter::default(),
            None,
            None,
            1,
        )
        .unwrap();
    assert_eq!(first_page.threads.len(), 1);
    assert_eq!(first_page.threads[0].message_count, 2);
    assert_eq!(first_page.threads[0].unread_count, 1);
    assert_eq!(
        first_page.threads[0].latest.preview.as_deref(),
        Some("preview of reply@x")
    );

    let second_page = store
        .list_threads(
            ThreadScope::Unified,
            &ThreadFilter::default(),
            None,
            first_page.next_cursor.as_deref(),
            1,
        )
        .unwrap();
    assert_eq!(
        second_page.threads[0].latest.subject.as_deref(),
        Some("Subject 3")
    );
    let third_page = store
        .list_threads(
            ThreadScope::Unified,
            &ThreadFilter::default(),
            None,
            second_page.next_cursor.as_deref(),
            1,
        )
        .unwrap();
    assert!(third_page.threads.is_empty());
}

#[test]
fn keywords_and_moves_update_thread_aggregates_and_counts() {
    let (store, _directory, inbox, trash) = setup();
    store
        .insert_messages("alice", inbox, &[message(1, "a@x", &[], 1_000, false)])
        .unwrap();
    store.set_mailbox_counts(inbox, 1, 1).unwrap();
    let thread = store
        .list_threads(ThreadScope::Mailbox(inbox), &unread_only(), None, None, 10)
        .unwrap()
        .threads[0]
        .clone();

    store
        .set_keywords(&[thread.latest.id], &[Keyword::Seen], &[])
        .unwrap();
    assert!(
        store
            .list_threads(ThreadScope::Mailbox(inbox), &unread_only(), None, None, 10)
            .unwrap()
            .threads
            .is_empty()
    );
    assert_eq!(store.mailbox(inbox).unwrap().unread_count, 0);

    let sources = store
        .move_emails(&[thread.latest.id], inbox, Some(trash))
        .unwrap();
    assert_eq!(sources[0].uid, Some(1));
    assert!(
        store
            .list_threads(
                ThreadScope::Unified,
                &ThreadFilter::default(),
                None,
                None,
                10
            )
            .unwrap()
            .threads
            .is_empty()
    );
    assert_eq!(
        store
            .list_threads(
                ThreadScope::Mailbox(trash),
                &ThreadFilter::default(),
                None,
                None,
                10
            )
            .unwrap()
            .threads
            .len(),
        1
    );
    assert!(
        store
            .thread_emails(thread.thread_id, None)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        store
            .thread_emails(thread.thread_id, Some(trash))
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_flag_set_on_any_copy_of_a_message_is_kept() {
    let (store, _directory, inbox, trash) = setup();
    store
        .insert_messages("alice", inbox, &[message(1, "self@x", &[], 1_000, false)])
        .unwrap();
    store
        .insert_messages("alice", trash, &[message(9, "self@x", &[], 1_000, true)])
        .unwrap();
    store.update_flags(inbox, &[(1, Flags::default())]).unwrap();
    let unread = |store: &Store| {
        store
            .list_threads(
                ThreadScope::Mailbox(inbox),
                &ThreadFilter::default(),
                None,
                None,
                1,
            )
            .unwrap()
            .threads[0]
            .unread_count
    };
    assert_eq!(unread(&store), 0);

    store.remove_uids(trash, &[9]).unwrap();
    store.update_flags(inbox, &[(1, Flags::default())]).unwrap();
    assert_eq!(unread(&store), 1);
}

#[test]
fn removed_uids_delete_orphan_emails_and_search_finds_the_rest() {
    let (store, _directory, inbox, _) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "a@x", &[], 1_000, false),
                message(2, "b@x", &[], 2_000, false),
            ],
        )
        .unwrap();
    store.remove_uids(inbox, &[1]).unwrap();
    assert_eq!(store.local_uids(inbox).unwrap(), vec![2]);
    assert_eq!(store.search("subj", 10, &[]).unwrap().len(), 1);
    assert_eq!(store.search("b@x", 10, &[]).unwrap().len(), 1);
}

#[test]
fn search_keeps_to_the_mailboxes_asked_and_says_where_each_hit_is() {
    let (store, _directory, inbox, trash) = setup();
    store
        .insert_messages("alice", inbox, &[message(1, "a@x", &[], 1_000, false)])
        .unwrap();
    store
        .insert_messages("alice", trash, &[message(2, "b@x", &[], 2_000, false)])
        .unwrap();

    let everywhere = store.search("subj", 10, &[]).unwrap();
    assert_eq!(everywhere.len(), 2);
    assert_eq!(everywhere[0].mailbox_id, trash);

    let in_inbox = store.search("subj", 10, &[inbox]).unwrap();
    assert_eq!(in_inbox.len(), 1);
    assert_eq!(in_inbox[0].mailbox_id, inbox);
}

#[test]
fn search_finds_words_inside_text_written_without_spaces() {
    let (store, _directory, inbox, _) = setup();
    let with = |uid: u32, subject: &str, name: &str, preview: &str| {
        let mut message = message(uid, &format!("{uid}@x"), &[], uid as i64 * 1_000, false);
        message.headers.subject = Some(subject.into());
        message.headers.from[0].name = Some(name.into());
        message.headers.preview = Some(preview.into());
        message
    };
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                with(1, "会議のお知らせ", "山田太郎", "明日は10時です"),
                with(2, "你好，世界。会议通知", "王伟", "ＰＤＦ資料を送ります"),
                with(3, "다음 회의를 시작합니다", "김민수", "안녕하세요"),
                with(4, "สวัสดีชาวโลก", "Somchai", "Résumé du projet"),
            ],
        )
        .unwrap();
    let found = |query: &str| -> Vec<u32> {
        let mut uids: Vec<u32> = store
            .search(query, 10, &[])
            .unwrap()
            .iter()
            .map(|hit| hit.email.received_at as u32 / 1_000)
            .collect();
        uids.sort_unstable();
        uids
    };
    assert_eq!(found("お知らせ"), [1]);
    assert_eq!(found("会議"), [1]);
    assert_eq!(found("太郎"), [1]);
    assert_eq!(found("10時"), [1]);
    assert_eq!(found("知会"), [0u32; 0]);
    assert_eq!(found("会议通知"), [2]);
    assert_eq!(found("世界"), [2]);
    assert_eq!(found("pdf"), [2]);
    assert_eq!(found("資料"), [2]);
    assert_eq!(found("의를"), [3]);
    assert_eq!(found("회의"), [3]);
    assert_eq!(found("ชาวโลก"), [4]);
    assert_eq!(found("โลก"), [4]);
    assert_eq!(found("resu proj"), [4]);
    assert_eq!(found("bob@ex"), [1, 2, 3, 4]);

    let id = store.search("お知らせ", 1, &[]).unwrap()[0].email.id;
    store
        .save_body(
            id,
            &RenderedBody {
                html: None,
                text: "年末年始の営業日についてご案内します".into(),
                has_remote_content: false,
                attachments: Vec::new(),
                unsubscribe: None,
            },
        )
        .unwrap();
    assert_eq!(found("営業日"), [1]);
    assert_eq!(found("お知らせ"), [1]);
}

fn unread_only() -> ThreadFilter {
    ThreadFilter {
        unread: true,
        ..ThreadFilter::default()
    }
}

fn address(email: &str) -> Address {
    Address {
        name: None,
        email: email.into(),
    }
}

fn subjects(store: &Store, scope: ThreadScope, filter: &ThreadFilter) -> Vec<String> {
    store
        .list_threads(scope, filter, None, None, 10)
        .unwrap()
        .threads
        .into_iter()
        .map(|thread| thread.latest.subject.unwrap())
        .collect()
}

#[test]
fn filter_combines_include_criteria_with_or() {
    let (store, _directory, inbox, _) = setup();
    let mut flagged = message(2, "b@x", &[], 2_000, true);
    flagged.flags.flagged = true;
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "a@x", &[], 3_000, false),
                flagged,
                message(3, "c@x", &[], 1_000, true),
            ],
        )
        .unwrap();
    let scope = ThreadScope::Mailbox(inbox);

    let unread_or_flagged = ThreadFilter {
        unread: true,
        flagged: true,
        ..ThreadFilter::default()
    };
    assert_eq!(
        subjects(&store, scope, &unread_or_flagged),
        ["Subject 1", "Subject 2"]
    );
    let unread = ThreadFilter {
        unread: true,
        ..ThreadFilter::default()
    };
    assert_eq!(subjects(&store, scope, &unread), ["Subject 1"]);
    assert_eq!(subjects(&store, scope, &ThreadFilter::default()).len(), 3);
}

#[test]
fn filter_ands_sections() {
    let (store, _directory, inbox, _) = setup();
    let mut with_attachment = message(1, "a@x", &[], 2_000, false);
    with_attachment.headers.has_attachment = true;
    store
        .insert_messages(
            "alice",
            inbox,
            &[with_attachment, message(2, "b@x", &[], 1_000, false)],
        )
        .unwrap();

    let filter = ThreadFilter {
        unread: true,
        with_attachment: true,
        ..ThreadFilter::default()
    };
    assert_eq!(
        subjects(&store, ThreadScope::Mailbox(inbox), &filter),
        ["Subject 1"]
    );
}

#[test]
fn to_me_and_cc_me_match_the_account_address_case_insensitively() {
    let (store, _directory, inbox, _) = setup();
    let mut to_me = message(1, "a@x", &[], 3_000, true);
    to_me.headers.to = vec![address("Alice@Example.com")];
    let mut cc_me = message(2, "b@x", &[], 2_000, true);
    cc_me.headers.to = vec![address("team@example.com")];
    cc_me.headers.cc = vec![address("alice@example.com")];
    let mut other = message(3, "c@x", &[], 1_000, true);
    other.headers.to = vec![address("team@example.com")];
    store
        .insert_messages("alice", inbox, &[to_me, cc_me, other])
        .unwrap();
    let scope = ThreadScope::Mailbox(inbox);

    let to = ThreadFilter {
        to_me: true,
        ..ThreadFilter::default()
    };
    assert_eq!(subjects(&store, scope, &to), ["Subject 1"]);
    let cc = ThreadFilter {
        cc_me: true,
        ..ThreadFilter::default()
    };
    assert_eq!(subjects(&store, scope, &cc), ["Subject 2"]);
    let either = ThreadFilter {
        to_me: true,
        cc_me: true,
        ..ThreadFilter::default()
    };
    assert_eq!(subjects(&store, scope, &either), ["Subject 1", "Subject 2"]);
}

#[test]
fn since_keeps_threads_received_from_then() {
    let (store, _directory, inbox, _) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "a@x", &[], 1_000, true),
                message(2, "b@x", &[], 3_000, true),
            ],
        )
        .unwrap();

    let filter = ThreadFilter {
        since: Some(2_000),
        ..ThreadFilter::default()
    };
    assert_eq!(
        subjects(&store, ThreadScope::Mailbox(inbox), &filter),
        ["Subject 2"]
    );
}

#[test]
fn account_ids_limit_the_unified_list() {
    let (store, _directory, inbox, _) = setup();
    store.insert_account(&test_support::account("bob")).unwrap();
    store
        .replace_mailboxes(
            "bob",
            &[RemoteMailbox {
                remote_name: "INBOX".into(),
                name: "INBOX".into(),
                depth: 0,
                role: Some(MailboxRole::Inbox),
                selectable: true,
            }],
        )
        .unwrap();
    let bob_inbox = store
        .mailbox_by_role("bob", MailboxRole::Inbox)
        .unwrap()
        .unwrap()
        .id;
    store
        .insert_messages("alice", inbox, &[message(1, "a@x", &[], 2_000, true)])
        .unwrap();
    store
        .insert_messages("bob", bob_inbox, &[message(2, "b@x", &[], 1_000, true)])
        .unwrap();

    let alice_only = ThreadFilter {
        account_ids: vec!["alice".into()],
        ..ThreadFilter::default()
    };
    assert_eq!(
        subjects(&store, ThreadScope::Unified, &alice_only),
        ["Subject 1"]
    );
    assert_eq!(
        subjects(&store, ThreadScope::Unified, &ThreadFilter::default()).len(),
        2
    );
}

#[test]
fn kept_threads_bypass_criteria_but_not_category() {
    let (store, _directory, inbox, _) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "a@x", &[], 2_000, true),
                message(2, "b@x", &[], 1_000, true),
            ],
        )
        .unwrap();
    let scope = ThreadScope::Mailbox(inbox);
    let read = store
        .list_threads(scope, &ThreadFilter::default(), None, None, 10)
        .unwrap()
        .threads[1]
        .thread_id;

    let filter = ThreadFilter {
        unread: true,
        keep_thread_ids: vec![read],
        ..ThreadFilter::default()
    };
    assert_eq!(subjects(&store, scope, &filter), ["Subject 2"]);
    assert!(
        store
            .list_threads(scope, &filter, Some(Category::Updates), None, 10)
            .unwrap()
            .threads
            .is_empty()
    );
}

#[test]
fn kept_threads_page_in_date_order() {
    let (store, _directory, inbox, _) = setup();
    store
        .insert_messages(
            "alice",
            inbox,
            &[
                message(1, "a@x", &[], 3_000, false),
                message(2, "b@x", &[], 2_000, true),
                message(3, "c@x", &[], 1_000, false),
            ],
        )
        .unwrap();
    let scope = ThreadScope::Mailbox(inbox);
    let read = store
        .list_threads(scope, &ThreadFilter::default(), None, None, 10)
        .unwrap()
        .threads[1]
        .thread_id;
    let filter = ThreadFilter {
        unread: true,
        keep_thread_ids: vec![read],
        ..ThreadFilter::default()
    };

    let mut seen = Vec::new();
    let mut cursor = None;
    loop {
        let page = store
            .list_threads(scope, &filter, None, cursor.as_deref(), 1)
            .unwrap();
        seen.extend(
            page.threads
                .into_iter()
                .map(|thread| thread.latest.subject.unwrap()),
        );
        match page.next_cursor {
            Some(next) => cursor = Some(next),
            None => break,
        }
    }
    assert_eq!(seen, ["Subject 1", "Subject 2", "Subject 3"]);
}
