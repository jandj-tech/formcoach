-- Support/contact form submissions from /support. Doubles as the
-- spam-throttle record: the API counts recent rows per IP and per email
-- before accepting a new submission.
CREATE TABLE IF NOT EXISTS support_requests (
  id SERIAL PRIMARY KEY,
  topic VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  ip VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_requests_ip_created_idx
  ON support_requests (ip, created_at);
CREATE INDEX IF NOT EXISTS support_requests_email_created_idx
  ON support_requests (email, created_at);
