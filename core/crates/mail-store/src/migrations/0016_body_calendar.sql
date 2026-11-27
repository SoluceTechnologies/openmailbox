ALTER TABLE email_body ADD COLUMN calendar TEXT;
DELETE FROM email_body WHERE lower(attachments_json) LIKE '%"mime_type":"text/calendar"%'
  OR lower(attachments_json) LIKE '%"mime_type":"application/ics"%'
  OR lower(attachments_json) LIKE '%.ics"%';
UPDATE email SET body_state = 0 WHERE body_state = 2 AND id NOT IN (SELECT email_id FROM email_body);
