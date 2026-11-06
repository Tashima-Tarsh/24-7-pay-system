import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (!request.cookies.get('sanbookpay_session')?.value) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard', '/upi-ids', '/ai-throttle', '/security', '/audit-log', '/docs', '/settings'],
}
