ALTER TABLE account ADD COLUMN notified_until INTEGER NOT NULL DEFAULT 0;

UPDATE account SET notified_until = coalesce((
  SELECT max(e.received_at)
  FROM email e
  JOIN email_mailbox em ON em.email_id = e.id
  JOIN mailbox m ON m.id = em.mailbox_id
  WHERE m.account_id = account.id AND m.role = 'inbox'
), 0);
