import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../../../lib/session';
import { TOKEN_COOKIE, backendCall, usingBackend } from '../../../../lib/backend';

export async function POST(request: Request) {
  // Best-effort: revoke the Sanctum token on the backend before clearing cookies.
  if (usingBackend()) {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (token) {
      try {
        await backendCall('/auth/logout', { method: 'POST', token });
      } catch {
        // The local session is cleared regardless.
      }
    }
  }

  // Relative redirect: Hostinger proxies the app behind an internal host,
  // so building the URL from request.url would point the browser at it.
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login' } });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(TOKEN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
