-- Per-size ball count breakdown on a class package. The buyer picks how many
-- size 5 / 6 / 7 balls to ship in their class; counts sum to player_count.
ALTER TABLE org_class_packages
  ADD COLUMN IF NOT EXISTS ball_size_5_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ball_size_6_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ball_size_7_count INTEGER NOT NULL DEFAULT 0;
