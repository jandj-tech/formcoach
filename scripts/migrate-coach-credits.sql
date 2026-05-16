-- Personal analysis credits for a coach / org owner, keyed by email.
-- Used for their own shot uploads ("My Uploads") — separate from the
-- team's coach-upload credits and from players' analysis tokens.
CREATE TABLE IF NOT EXISTS coach_credits (
  email VARCHAR(255) PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0
);
