-- Add shipping address columns to org_class_packages
ALTER TABLE org_class_packages
  ADD COLUMN IF NOT EXISTS shipping_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(10);
