CREATE TABLE correspondent (
  email        TEXT PRIMARY KEY COLLATE NOCASE,
  name         TEXT,
  received     INTEGER NOT NULL DEFAULT 0,
  sent         INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

INSERT INTO correspondent (email, name, received, last_seen_at)
SELECT json_extract(sender.value, '$.email'), json_extract(sender.value, '$.name'), 1, e.received_at
FROM email e
JOIN account a ON a.id = e.account_id
JOIN json_each(e.from_json) AS sender
WHERE json_extract(sender.value, '$.email') IS NOT NULL
  AND lower(json_extract(sender.value, '$.email')) <> lower(a.email)
ON CONFLICT (email) DO UPDATE SET
  received = received + 1,
  last_seen_at = max(last_seen_at, excluded.last_seen_at),
  name = coalesce(excluded.name, name);

INSERT INTO correspondent (email, name, sent, last_seen_at)
SELECT json_extract(recipient.value, '$.email'), json_extract(recipient.value, '$.name'), 1, e.received_at
FROM email e
JOIN account a ON a.id = e.account_id
JOIN json_each(e.from_json) AS sender ON lower(json_extract(sender.value, '$.email')) = lower(a.email)
JOIN json_each(e.to_json) AS recipient
WHERE json_extract(recipient.value, '$.email') IS NOT NULL
  AND lower(json_extract(recipient.value, '$.email')) <> lower(a.email)
ON CONFLICT (email) DO UPDATE SET
  sent = sent + 1,
  last_seen_at = max(last_seen_at, excluded.last_seen_at),
  name = coalesce(excluded.name, name);

INSERT INTO correspondent (email, name, sent, last_seen_at)
SELECT json_extract(recipient.value, '$.email'), json_extract(recipient.value, '$.name'), 1, e.received_at
FROM email e
JOIN account a ON a.id = e.account_id
JOIN json_each(e.from_json) AS sender ON lower(json_extract(sender.value, '$.email')) = lower(a.email)
JOIN json_each(e.cc_json) AS recipient
WHERE json_extract(recipient.value, '$.email') IS NOT NULL
  AND lower(json_extract(recipient.value, '$.email')) <> lower(a.email)
ON CONFLICT (email) DO UPDATE SET
  sent = sent + 1,
  last_seen_at = max(last_seen_at, excluded.last_seen_at),
  name = coalesce(excluded.name, name);
