import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_HOME, SESSION_COOKIE, SUPER_ROLE, verifySessionToken, type Role } from './lib/session';

// Which role may open each protected section. The super role (developer) may open any of them.
const PROTECTED: Array<{ prefix: string; role: Role }> = [
  { prefix: '/developer', role: 'developer' },
  { prefix: '/manager', role: 'manager' },
  { prefix: '/telecaller', role: 'telecaller' },
  { prefix: '/calling-executive', role: 'calling-executive' },
  { prefix: '/seller', role: 'seller' },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    return user ? NextResponse.redirect(new URL(ROLE_HOME[user.role], request.url)) : NextResponse.next();
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_HOME[user.role], request.url));
  }

  // The super role (developer) may open every section; everyone else only their own.
  const section = PROTECTED.find(s => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`));
  if (section && section.role !== user.role && user.role !== SUPER_ROLE) {
    return NextResponse.redirect(new URL(ROLE_HOME[user.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
