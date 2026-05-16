-- Class packages for organizations
CREATE TABLE IF NOT EXISTS org_class_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_session_id VARCHAR(255) UNIQUE,
  player_count INTEGER NOT NULL,
  price_per_player_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  token_pool INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players enrolled in a class package
CREATE TABLE IF NOT EXISTS org_class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES org_class_packages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100),
  last_name_initial VARCHAR(10),
  first_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  final_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  first_score NUMERIC(4,2),
  final_score NUMERIC(4,2),
  display_final_score NUMERIC(4,2),
  is_first_class BOOLEAN DEFAULT true,
  certificate_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_class_packages_org_id ON org_class_packages(org_id);
CREATE INDEX IF NOT EXISTS idx_org_class_enrollments_package_id ON org_class_enrollments(package_id);
CREATE INDEX IF NOT EXISTS idx_org_class_enrollments_user_id ON org_class_enrollments(user_id);
