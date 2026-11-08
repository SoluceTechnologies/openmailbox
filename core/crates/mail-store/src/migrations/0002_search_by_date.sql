-- The full-text index uses a key ordered by date as rowid, so that a search reads the newest
-- matches first instead of loading and sorting every match.
ALTER TABLE email ADD COLUMN search_key INTEGER;
UPDATE email SET search_key = (received_at << 20) | (id & 1048575);
CREATE UNIQUE INDEX email_by_search_key ON email(search_key);

DROP TRIGGER email_after_delete;
DROP TABLE email_fts;
CREATE VIRTUAL TABLE email_fts USING fts5(
  subject, participants, body,
  content = '', contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO email_fts (rowid, subject, participants, body)
SELECT
  e.search_key,
  e.subject,
  (SELECT group_concat(part, ' ') FROM (
     SELECT json_extract(value, '$.name') AS part FROM json_each(e.from_json)
     UNION ALL SELECT json_extract(value, '$.email') FROM json_each(e.from_json)
     UNION ALL SELECT json_extract(value, '$.name') FROM json_each(e.to_json)
     UNION ALL SELECT json_extract(value, '$.email') FROM json_each(e.to_json)
     UNION ALL SELECT json_extract(value, '$.name') FROM json_each(e.cc_json)
     UNION ALL SELECT json_extract(value, '$.email') FROM json_each(e.cc_json)
   ) WHERE part IS NOT NULL),
  COALESCE(substr(b.text, 1, 20000), e.preview)
FROM email e LEFT JOIN email_body b ON b.email_id = e.id;

CREATE TRIGGER email_after_delete AFTER DELETE ON email BEGIN
  DELETE FROM email_fts WHERE rowid = old.search_key;
END;
