-- Selling is on by default for every entitled (paid/approved) organization.
-- organizations.platform_share_percent is now an optional per-org OVERRIDE of
-- the platform default percent (NULL = default), no longer an on/off switch.
-- selling_disabled is the admin's pause switch for a specific org.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS selling_disabled BOOLEAN NOT NULL DEFAULT FALSE;
