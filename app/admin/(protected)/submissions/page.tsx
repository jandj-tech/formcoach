import { db } from '@/lib/db'
import SubmissionsTable, { type SubmissionRow } from './SubmissionsTable'

export default async function SubmissionsPage() {
  // Resolve the email of the account each submission was sent under:
  //  - coach self-uploads store it directly on the submission (s.email)
  //  - player uploads link to a user account (users.email)
  //  - team uploads link to a team, sent under the coach's account (teams.admin_email)
  const rows = (await db`
    SELECT s.id,
           COALESCE(s.email, u.email, t.admin_email) AS email,
           s.status, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN teams t ON t.id = s.team_id
    ORDER BY s.created_at DESC
    LIMIT 200
  `) as unknown as SubmissionRow[]

  return <SubmissionsTable submissions={rows} />
}
