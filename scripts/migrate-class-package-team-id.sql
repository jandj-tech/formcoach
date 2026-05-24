-- Link each class package to the auto-created team.
ALTER TABLE org_class_packages
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Store phone number collected at Stripe checkout.
ALTER TABLE org_class_packages
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
