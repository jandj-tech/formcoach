import { NextResponse } from 'next/server'

// Retired (security audit 2026-09-28, item 2). This unauthenticated endpoint
// took any submission id plus any email address, rewrote submissions.email to
// that address and mailed it the results link — so anyone holding one
// email_list token could steal a victim's results link and drain the victim's
// tokens. Nothing calls it any more: the web caller went away with the gate
// page (8992ff5) and the iOS app never used it. Kept as a 410 so a stale
// client gets a clear answer instead of a 404.
function gone() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Results are on your dashboard.' },
    { status: 410 },
  )
}

export const GET = gone
export const POST = gone
