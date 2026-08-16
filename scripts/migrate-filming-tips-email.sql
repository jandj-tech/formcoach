-- One filming-tips email per address, ever.
--
-- email_logs is already the ledger for transactional sends, so the "have we
-- told this person yet?" question lives there rather than in a new column on
-- users — coaches uploading for a roster, team-code uploads and legacy
-- anonymous submissions all have an email but not always a users row.
--
-- The partial unique index is what makes the send safe: the route claims the
-- slot with INSERT ... ON CONFLICT DO NOTHING RETURNING id, and only sends if
-- it got a row back. Two uploads finishing at the same moment, or a retried
-- request, can therefore never produce two emails.
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_one_filming_tips
  ON email_logs (email) WHERE email_type = 'filming_tips';
