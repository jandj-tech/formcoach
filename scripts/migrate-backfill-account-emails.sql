-- Backfill every existing account email into the marketing email list:
-- players, founding coaches, additional coaches, and organization admins.
-- ON CONFLICT DO NOTHING preserves existing rows — anyone who already
-- unsubscribed keeps their unsubscribed_at. Idempotent; new signups are
-- added at registration time by lib/email-list.ts.
INSERT INTO email_list (email)
SELECT LOWER(email) FROM users WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

INSERT INTO email_list (email)
SELECT LOWER(admin_email) FROM teams WHERE admin_email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

INSERT INTO email_list (email)
SELECT LOWER(email) FROM team_coaches WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

INSERT INTO email_list (email)
SELECT LOWER(admin_email) FROM organizations WHERE admin_email IS NOT NULL
ON CONFLICT (email) DO NOTHING;
