//! Store benchmark on a large generated mailbox.
//!
//! cargo run --release -p mail-store --example benchmark -- [messages]

use std::time::{Duration, Instant};

use mail_model::{
    Account, Address, FetchedMessage, Flags, Keyword, MailboxRole, ParsedHeaders, RemoteMailbox,
    Security, ServerEndpoint, ThreadScope,
};
use mail_store::Store;

const BATCH_SIZE: usize = 50;
const PAGE_SIZE: u32 = 50;
const SAMPLES: usize = 200;

struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: u64) -> u64 {
        self.next() % bound
    }
}

const WORDS: &[&str] = &[
    "projet",
    "facture",
    "réunion",
    "livraison",
    "devis",
    "maquette",
    "serveur",
    "contrat",
    "planning",
    "budget",
    "recrutement",
    "lancement",
    "atlas",
    "client",
    "rapport",
    "migration",
    "sécurité",
    "équipe",
];

fn account(id: &str) -> Account {
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
        imap: endpoint.clone(),
        smtp: endpoint,
        color: 0,
        created_at: 0,
    }
}

fn remote(name: &str, role: MailboxRole) -> RemoteMailbox {
    RemoteMailbox {
        remote_name: name.into(),
        name: name.into(),
        depth: 0,
        role: Some(role),
        selectable: true,
    }
}

fn sentence(random: &mut Random, words: usize) -> String {
    (0..words)
        .map(|_| WORDS[random.below(WORDS.len() as u64) as usize])
        .collect::<Vec<_>>()
        .join(" ")
}

fn generate(random: &mut Random, count: usize, now: i64) -> Vec<FetchedMessage> {
    let mut messages = Vec::with_capacity(count);
    let mut thread = 0;
    for index in 0..count {
        if random.below(3) == 0 || index == 0 {
            thread = index;
        }
        let sender = random.below(400);
        messages.push(FetchedMessage {
            uid: index as u32 + 1,
            flags: Flags {
                seen: random.below(10) < 8,
                flagged: random.below(40) == 0,
                ..Flags::default()
            },
            internal_date: Some(now - (count - index) as i64 * 60_000),
            size: 4_000 + random.below(60_000) as u32,
            headers: ParsedHeaders {
                message_id: Some(format!("message.{index}@example.com")),
                references: if thread == index {
                    Vec::new()
                } else {
                    vec![format!("message.{thread}@example.com")]
                },
                subject: Some(format!("{} {}", sentence(random, 4), thread)),
                from: vec![Address {
                    name: Some(format!("Contact {sender}")),
                    email: format!("contact{sender}@example.org"),
                }],
                to: vec![Address {
                    name: None,
                    email: "alice@example.com".into(),
                }],
                preview: Some(sentence(random, 24)),
                has_attachment: random.below(8) == 0,
                ..ParsedHeaders::default()
            },
        });
    }
    messages
}

fn measure<T>(samples: usize, mut operation: impl FnMut(usize) -> T) -> (Duration, Duration) {
    let mut durations: Vec<Duration> = (0..samples)
        .map(|index| {
            let started = Instant::now();
            std::hint::black_box(operation(index));
            started.elapsed()
        })
        .collect();
    durations.sort();
    (durations[samples / 2], durations[samples * 95 / 100])
}

fn report(label: &str, (median, p95): (Duration, Duration)) {
    println!(
        "| {label:<44} | {:>9.3} | {:>9.3} |",
        median.as_secs_f64() * 1e3,
        p95.as_secs_f64() * 1e3
    );
}

fn main() {
    let count: usize = std::env::args()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(50_000);
    let directory =
        std::env::temp_dir().join(format!("mail-store-benchmark-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("mail.db");
    let store = Store::open(&path).unwrap();
    let mut random = Random(0x9e3779b97f4a7c15);
    let now = 1_800_000_000_000;

    let mut inboxes = Vec::new();
    for name in ["alice", "bob"] {
        store.insert_account(&account(name)).unwrap();
        store
            .replace_mailboxes(
                name,
                &[
                    remote("INBOX", MailboxRole::Inbox),
                    remote("Archive", MailboxRole::Archive),
                    remote("Trash", MailboxRole::Trash),
                ],
            )
            .unwrap();
        inboxes.push(
            store
                .mailbox_by_role(name, MailboxRole::Inbox)
                .unwrap()
                .unwrap()
                .id,
        );
    }
    let (alice_inbox, bob_inbox) = (inboxes[0], inboxes[1]);
    let trash = store
        .mailbox_by_role("alice", MailboxRole::Trash)
        .unwrap()
        .unwrap()
        .id;

    let alice_messages = generate(&mut random, count * 9 / 10, now);
    let bob_messages = generate(&mut random, count / 10, now);
    let started = Instant::now();
    let mut batch_durations = Vec::new();
    for (account, mailbox, messages) in [
        ("alice", alice_inbox, &alice_messages),
        ("bob", bob_inbox, &bob_messages),
    ] {
        for batch in messages.chunks(BATCH_SIZE) {
            let batch_started = Instant::now();
            store.insert_messages(account, mailbox, batch).unwrap();
            batch_durations.push(batch_started.elapsed());
        }
    }
    let insert_total = started.elapsed();
    batch_durations.sort();

    println!("\n{count} messages, 2 accounts, batches of {BATCH_SIZE}\n");
    println!(
        "| {:<44} | {:>9} | {:>9} |",
        "Operation", "p50 (ms)", "p95 (ms)"
    );
    println!("|{:-<46}|{:-<11}|{:-<11}|", "", "", "");
    report(
        &format!("Insert one batch of {BATCH_SIZE} synced messages"),
        (
            batch_durations[batch_durations.len() / 2],
            batch_durations[batch_durations.len() * 95 / 100],
        ),
    );
    report(
        "Unified inbox, first page",
        measure(SAMPLES, |_| {
            store
                .list_threads(ThreadScope::Unified, false, None, PAGE_SIZE)
                .unwrap()
        }),
    );

    let mut cursor = None;
    for _ in 0..20 {
        cursor = store
            .list_threads(ThreadScope::Unified, false, cursor.as_deref(), PAGE_SIZE)
            .unwrap()
            .next_cursor;
    }
    report(
        "Unified inbox, page 21 (cursor)",
        measure(SAMPLES, |_| {
            store
                .list_threads(ThreadScope::Unified, false, cursor.as_deref(), PAGE_SIZE)
                .unwrap()
        }),
    );
    report(
        "Unified inbox, unread only, first page",
        measure(SAMPLES, |_| {
            store
                .list_threads(ThreadScope::Unified, true, None, PAGE_SIZE)
                .unwrap()
        }),
    );
    report(
        "Mailbox, first page",
        measure(SAMPLES, |_| {
            store
                .list_threads(ThreadScope::Mailbox(alice_inbox), false, None, PAGE_SIZE)
                .unwrap()
        }),
    );

    let page = store
        .list_threads(ThreadScope::Mailbox(alice_inbox), false, None, PAGE_SIZE)
        .unwrap()
        .threads;
    report(
        "Open a thread (thread emails)",
        measure(SAMPLES, |index| {
            store
                .thread_emails(page[index % page.len()].thread_id, Some(alice_inbox))
                .unwrap()
        }),
    );
    report(
        "Search, frequent word",
        measure(SAMPLES, |_| store.search("facture", 100).unwrap()),
    );
    report(
        "Search, two prefixes",
        measure(SAMPLES, |_| store.search("recru lanc", 100).unwrap()),
    );
    report(
        "Address suggestions",
        measure(SAMPLES, |_| store.suggest_addresses("ma", 8).unwrap()),
    );
    report(
        "Search, no match",
        measure(SAMPLES, |_| store.search("introuvable", 100).unwrap()),
    );
    report(
        "Mark a thread as read and unread",
        measure(SAMPLES, |index| {
            let thread = &page[index % page.len()];
            let ids = store
                .thread_email_ids(alice_inbox, thread.thread_id)
                .unwrap();
            if index % 2 == 0 {
                store.set_keywords(&ids, &[Keyword::Seen], &[]).unwrap()
            } else {
                store.set_keywords(&ids, &[], &[Keyword::Seen]).unwrap()
            }
        }),
    );
    let movable = store
        .list_threads(
            ThreadScope::Mailbox(alice_inbox),
            false,
            None,
            SAMPLES as u32,
        )
        .unwrap()
        .threads;
    report(
        "Move a thread to the trash",
        measure(movable.len(), |index| {
            let ids = store
                .thread_email_ids(alice_inbox, movable[index].thread_id)
                .unwrap();
            store.move_emails(&ids, alice_inbox, Some(trash)).unwrap()
        }),
    );
    let size = ["", "-wal"]
        .iter()
        .filter_map(|suffix| std::fs::metadata(format!("{}{suffix}", path.display())).ok())
        .map(|metadata| metadata.len())
        .sum::<u64>();
    println!(
        "\nInitial insert: {:.1} s ({:.0} messages/s), database {:.1} MB\n",
        insert_total.as_secs_f64(),
        count as f64 / insert_total.as_secs_f64(),
        size as f64 / 1e6
    );
    if std::env::var_os("KEEP_DATABASE").is_none() {
        std::fs::remove_dir_all(&directory).ok();
    } else {
        println!("Database kept at {}", path.display());
    }
}
