-- Team chat: coach-moderated messaging inside each team.
-- Kid-safety by design: coach controls who can post, every message passes
-- the profanity filter server-side, and users can report and block.

CREATE TABLE IF NOT EXISTS team_messages (
  id BIGSERIAL PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name VARCHAR(120) NOT NULL,
  sender_role VARCHAR(10) NOT NULL DEFAULT 'player', -- 'coach' | 'player'
  body VARCHAR(1000) NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_team_created
  ON team_messages (team_id, id DESC);

-- Who may post: 'coach-only' (default — the chat is locked until the coach
-- opens it) or 'everyone'.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS chat_mode VARCHAR(20) NOT NULL DEFAULT 'coach-only';
ALTER TABLE teams ALTER COLUMN chat_mode SET DEFAULT 'coach-only';

-- Coach-muted players (per team).
CREATE TABLE IF NOT EXISTS team_chat_mutes (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- Personal blocks: the blocker never sees the blocked user's messages.
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

-- Players the coach has granted chat access (used in 'coach-only' mode;
-- 'everyone' mode lets any non-muted member post).
CREATE TABLE IF NOT EXISTS team_chat_allows (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
