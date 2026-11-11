ALTER TABLE email ADD COLUMN category INTEGER;
ALTER TABLE email ADD COLUMN sender TEXT;
UPDATE email SET sender = lower(json_extract(from_json, '$[0].email'));
CREATE INDEX email_by_sender ON email(sender);

ALTER TABLE mailbox_thread ADD COLUMN category INTEGER NOT NULL DEFAULT 0;
CREATE INDEX mailbox_thread_by_category ON mailbox_thread(mailbox_id, category, last_received_at);
CREATE INDEX mailbox_thread_unified_by_category ON mailbox_thread(unified, category, last_received_at);

-- Senders the user moved to another category by hand.
CREATE TABLE sender_category (
  email    TEXT PRIMARY KEY COLLATE NOCASE,
  category INTEGER NOT NULL
) WITHOUT ROWID;
