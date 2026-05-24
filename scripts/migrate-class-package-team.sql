-- Link the auto-created "Training Camp" team to its class package, and let
-- the existing orders table carry class-package ball shipments (one row per
-- package, with quantity = playerCount).

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS class_package_id UUID REFERENCES org_class_packages(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kind VARCHAR(30) NOT NULL DEFAULT 'single';
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS class_package_id UUID REFERENCES org_class_packages(id) ON DELETE SET NULL;

-- Prevent the same player from being enrolled twice in the same package
-- (so re-joining a team doesn't double-grant tokens).
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_class_enrollments_pkg_user
  ON org_class_enrollments(package_id, user_id)
  WHERE user_id IS NOT NULL;
