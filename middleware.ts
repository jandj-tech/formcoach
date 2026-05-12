import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
