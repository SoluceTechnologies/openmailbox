-- Messages stored before the headers that tell how mail was sent were fetched: their category
-- was guessed from the sender, and the inbox ones are checked again from their headers.
ALTER TABLE email ADD COLUMN signals_known INTEGER NOT NULL DEFAULT 1;
UPDATE email SET signals_known = 0;
CREATE INDEX email_signals_unknown ON email(id) WHERE signals_known = 0;
