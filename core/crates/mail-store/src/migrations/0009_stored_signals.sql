-- How each message was sent, from its headers (see SendingSignals::bits): new rules classify stored
-- mail again without fetching anything. NULL until the headers are fetched.
ALTER TABLE email ADD COLUMN signals INTEGER;
DROP INDEX email_signals_unknown;
ALTER TABLE email DROP COLUMN signals_known;
CREATE INDEX email_signals_unknown ON email(id) WHERE signals IS NULL;
