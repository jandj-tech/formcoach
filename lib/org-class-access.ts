import { NextRequest } from 'next/server'
import { db } from './db'
import { getOrgSessionFromRequest } from './org-auth'
import { getTeamSessionFromRequest } from './team-auth'

/**
 * Two people run a class package: the organization that bought it, and the
 * coach signed in to the class team it created. Both get the class manager,
 * so both need to be able to enroll players and reset progress.
 */
export async function canManageClassPackage(req: NextRequest, packageId: string): Promise<boolean> {
  const orgSession = await getOrgSessionFromRequest(req)
  if (orgSession) {
    const [owned] = (await db`
      SELECT id FROM org_class_packages
      WHERE id = ${packageId} AND org_id = ${orgSession.orgId}
      LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (owned) return true
  }

  const teamSession = await getTeamSessionFromRequest(req)
  if (teamSession) {
    const [linked] = (await db`
      SELECT id FROM teams
      WHERE id = ${teamSession.teamId} AND class_package_id = ${packageId}
      LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (linked) return true
  }

  return false
}

/** The package an enrollment belongs to, or null when the row doesn't exist. */
export async function packageIdForEnrollment(enrollmentId: string): Promise<string | null> {
  const [row] = (await db`
    SELECT package_id FROM org_class_enrollments WHERE id = ${enrollmentId} LIMIT 1
  `) as unknown as Array<{ package_id: string }>
  return row?.package_id ?? null
}
