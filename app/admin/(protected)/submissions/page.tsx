import { db } from '@/lib/db'
import SubmissionsTable, { type SubmissionRow } from './SubmissionsTable'

export default async function SubmissionsPage() {
  const rows = (await db`
    SELECT s.id, s.email, s.status, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    ORDER BY s.created_at DESC
    LIMIT 200
  `) as unknown as SubmissionRow[]

  return <SubmissionsTable submissions={rows} />
}
