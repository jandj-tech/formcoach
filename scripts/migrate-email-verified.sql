-- Email-keyed entitlements (complimentary memberships on email_list, guest
-- ball credits) used to be handed to whichever account carried the address,
-- and signup never proves the address. From here on they only land on an
-- account whose inbox has been proven: a consumed reset/setup link, the signed
-- confirmation link, or a provider (Google/Apple) that verified the address.
--
-- email_verified_at records that proof. NULL = not proven.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Backfill ONLY from provider identities whose recorded address is the
-- account's address — the one proof that already exists in the data. Password
-- accounts stay unproven until they confirm (a pending comp emails them the
-- link). Idempotent: rows already marked are left alone.
UPDATE users u
SET email_verified_at = COALESCE(i.first_seen, NOW())
FROM (
  SELECT user_id, LOWER(email) AS email, MIN(created_at) AS first_seen
  FROM user_oauth_identities
  WHERE email IS NOT NULL
  GROUP BY user_id, LOWER(email)
) i
WHERE i.user_id = u.id
  AND i.email = LOWER(u.email)
  AND u.email_verified_at IS NULL;
