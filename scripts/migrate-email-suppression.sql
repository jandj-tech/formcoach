-- Bounce and complaint suppression for the marketing list.
--
-- email_list only ever recorded unsubscribed_at, so the monthly promo cron
-- selected "WHERE unsubscribed_at IS NULL" and re-mailed every address on file
-- forever -- including ones that hard-bounced months ago, and including anyone
-- who hit "report spam" instead of the unsubscribe link. Repeatedly delivering
-- to dead mailboxes is one of the fastest ways to move a sending domain from
-- the inbox to the spam folder, and a complaint is the single most expensive
-- signal a recipient can send us.
--
-- Both columns are written by app/api/webhook/resend/route.ts from Resend
-- webhook events and read by activeMarketingRecipients() in lib/email-list.ts.
-- A suppressed row is kept, not deleted: the address must stay on file so a
-- later signup cannot silently re-subscribe it.
--
-- No backfill is possible here -- past bounces exist only in Resend's own
-- history, not in this database. Suppression starts from the first webhook
-- delivery after this migration runs.
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMP;
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS complained_at TIMESTAMP;
