import { db } from '@/lib/db'

// Add an account's email to the marketing list. ON CONFLICT DO NOTHING keeps
// an existing row untouched — critically, someone who unsubscribed earlier
// stays unsubscribed (unsubscribed_at is preserved). Every marketing email
// carries an unsubscribe link, and the send crons skip unsubscribed rows.
// Never throws: signup must succeed even if the list insert fails.
export async function addToEmailList(email: string | null | undefined): Promise<void> {
  const emailLower = email?.toLowerCase().trim()
  if (!emailLower) return
  try {
    await db`
      INSERT INTO email_list (email)
      VALUES (${emailLower})
      ON CONFLICT (email) DO NOTHING
    `
  } catch (err) {
    console.error('[email-list] failed to add email:', err)
  }
}
