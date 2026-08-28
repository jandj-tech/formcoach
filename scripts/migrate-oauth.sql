-- Sign in with Google / Sign in with Apple.
--
-- Identities live in their own table rather than as columns on `users` so one
-- account can hold both providers (and a password) at once, and so an Apple
-- private-relay login — whose email never matches anything — is still
-- recognised on the second visit by its stable subject.

CREATE TABLE IF NOT EXISTS user_oauth_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,              -- 'google' | 'apple'
  subject VARCHAR(255) NOT NULL,              -- provider's stable user id (`sub`)
  email VARCHAR(255),                         -- as reported by the provider, may be a relay address
  -- Apple only. Apple requires apps that delete accounts to also revoke the
  -- Sign in with Apple grant, and revocation needs this token.
  refresh_token TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON user_oauth_identities(user_id);

-- Accounts created through a provider have no password. The column was already
-- nullable in practice; state it explicitly so this can never regress.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- One-time codes that hand a finished browser sign-in back to the native app.
-- The app opens the same web flow in ASWebAuthenticationSession; the callback
-- deep-links back with a code, and the app trades it for a session JWT over
-- HTTPS. The JWT itself never travels in a URL.
CREATE TABLE IF NOT EXISTS oauth_login_codes (
  code VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  redeemed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_login_codes_expiry ON oauth_login_codes(expires_at);
