import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/dashboard')) {
    const session = await getSessionFromRequest(req)
    if (!session) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname.startsWith('/team/dashboard')) {
    const session = await getTeamSessionFromRequest(req)
    if (!session) {
      return NextResponse.redirect(new URL('/team/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/team/dashboard/:path*'],
}
