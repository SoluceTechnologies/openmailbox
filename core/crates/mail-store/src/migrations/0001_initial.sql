CREATE TABLE account (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  username      TEXT NOT NULL,
  imap_host     TEXT NOT NULL,
  imap_port     INTEGER NOT NULL,
  imap_security TEXT NOT NULL,
  smtp_host     TEXT NOT NULL,
  smtp_port     INTEGER NOT NULL,
  smtp_security TEXT NOT NULL,
  color         INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE mailbox (
  id             INTEGER PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  remote_name    TEXT NOT NULL,
  name           TEXT NOT NULL,
  depth          INTEGER NOT NULL DEFAULT 0,
  role           TEXT,
  selectable     INTEGER NOT NULL DEFAULT 1,
  total_count    INTEGER NOT NULL DEFAULT 0,
  unread_count   INTEGER NOT NULL DEFAULT 0,
  uidvalidity    INTEGER,
  uidnext        INTEGER,
  highest_modseq INTEGER,
  sync_since     INTEGER,
  synced_at      INTEGER,
  UNIQUE (account_id, remote_name)
);

CREATE TABLE thread (
  id         INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  root       TEXT NOT NULL,
  UNIQUE (account_id, root)
);

CREATE TABLE email (
  id                INTEGER PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  thread_id         INTEGER NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
  message_id        TEXT,
  references_header TEXT,
  subject           TEXT,
  from_json         TEXT NOT NULL,
  to_json           TEXT NOT NULL,
  cc_json           TEXT NOT NULL,
  reply_to_json     TEXT NOT NULL,
  received_at       INTEGER NOT NULL,
  size              INTEGER NOT NULL DEFAULT 0,
  preview           TEXT,
  has_attachment    INTEGER NOT NULL DEFAULT 0,
  is_seen           INTEGER NOT NULL DEFAULT 0,
  is_flagged        INTEGER NOT NULL DEFAULT 0,
  is_answered       INTEGER NOT NULL DEFAULT 0,
  is_draft          INTEGER NOT NULL DEFAULT 0,
  body_state        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX email_by_message_id ON email(account_id, message_id);
CREATE INDEX email_by_thread ON email(thread_id, received_at);

CREATE TABLE email_mailbox (
  mailbox_id INTEGER NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
  email_id   INTEGER NOT NULL REFERENCES email(id) ON DELETE CASCADE,
  uid        INTEGER,
  PRIMARY KEY (mailbox_id, email_id)
) WITHOUT ROWID;

CREATE UNIQUE INDEX email_mailbox_by_uid ON email_mailbox(mailbox_id, uid);
CREATE INDEX email_mailbox_by_email ON email_mailbox(email_id);

CREATE TABLE mailbox_thread (
  mailbox_id       INTEGER NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
  thread_id        INTEGER NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
  account_id       TEXT NOT NULL,
  unified          INTEGER NOT NULL,
  latest_email_id  INTEGER NOT NULL,
  last_received_at INTEGER NOT NULL,
  message_count    INTEGER NOT NULL,
  unread_count     INTEGER NOT NULL,
  is_flagged       INTEGER NOT NULL,
  has_attachment   INTEGER NOT NULL,
  PRIMARY KEY (mailbox_id, thread_id)
);

CREATE INDEX mailbox_thread_by_date ON mailbox_thread(mailbox_id, last_received_at);
CREATE INDEX mailbox_thread_unified ON mailbox_thread(unified, last_received_at);
CREATE INDEX mailbox_thread_by_thread ON mailbox_thread(thread_id);

CREATE TABLE email_body (
  email_id           INTEGER PRIMARY KEY REFERENCES email(id) ON DELETE CASCADE,
  html               TEXT,
  text               TEXT NOT NULL,
  attachments_json   TEXT NOT NULL,
  has_remote_content INTEGER NOT NULL
);

CREATE VIRTUAL TABLE email_fts USING fts5(
  subject, participants, body,
  content = '', contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER email_after_delete AFTER DELETE ON email BEGIN
  DELETE FROM email_fts WHERE rowid = old.id;
END;

CREATE TABLE pending_op (
  id            INTEGER PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT 0,
  in_flight     INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX pending_op_by_account ON pending_op(account_id, failed, next_retry_at);
