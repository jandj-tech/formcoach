-- Team chat: who actually sent each message.
--
-- Messages used to carry only a display name, and coach/org posts had no
-- user id, so "is this mine?" was answered by comparing names. Every coach
-- without a nickname was stored as "Coach", so two coaches looked identical
-- and each saw the other's messages as their own. The sender's email and
-- session kind ('player' | 'coach' | 'org') now travel with the message;
-- rows written before this have NULLs and keep displaying their stored name.
-- Additive and idempotent. The email is never sent to chat clients.
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS sender_email VARCHAR(255);
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS sender_kind VARCHAR(10);
