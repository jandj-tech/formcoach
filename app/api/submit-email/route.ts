import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendResultsEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { email, submissionId } = await req.json()

    if (!email || !submissionId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Fetch submission + its token
    const [submission] = await db`
      SELECT id, token, status FROM submissions WHERE id = ${submissionId}
    `

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Update submission with email
    await db`
      UPDATE submissions SET email = ${emailLower} WHERE id = ${submissionId}
    `

    // Upsert to email list
    await db`
      INSERT INTO email_list (email)
      VALUES (${emailLower})
      ON CONFLICT (email) DO NOTHING
    `

    // Log transactional email
    await db`
      INSERT INTO email_logs (email, email_type)
      VALUES (${emailLower}, 'results')
    `

    // Send results email
    await sendResultsEmail(emailLower, submission.token)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submit email error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
