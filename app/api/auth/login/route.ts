import { NextResponse } from 'next/server';
import { authenticate } from '../../../../lib/users';
import { createSessionToken, ROLE_HOME, SESSION_COOKIE, SESSION_MAX_AGE, type Role, type SessionUser } from '../../../../lib/session';
import { API_BASE, TOKEN_COOKIE, backendCall, backendError, usingBackend } from '../../../../lib/backend';

export async function POST(request: Request) {
  // `login` is the email or the Staff ID; `email` is still accepted from older clients.
  let login = '';
  let password = '';
  try {
    const body = await request.json();
    login = typeof body.login === 'string' ? body.login.trim() : typeof body.email === 'string' ? body.email.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!login || !password) {
    return NextResponse.json({ error: 'Email or Staff ID, and password, are required' }, { status: 400 });
  }
  // Staff IDs are stored in capitals and the backend match is case-sensitive.
  if (!login.includes('@')) login = login.toUpperCase();

  const secure = process.env.NODE_ENV === 'production';
  const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: SESSION_MAX_AGE };

  // --- Backend mode: authenticate against the Laravel API and keep its Sanctum token ---
  if (usingBackend()) {
    let apiRes: Response;
    try {
      apiRes = await backendCall('/auth/login', { method: 'POST', body: { login, password } });
    } catch (err) {
      console.error('Login failed reaching the backend:', API_BASE, err);
      return NextResponse.json({ error: 'Could not reach the server. Please try again.' }, { status: 502 });
    }
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      const status = apiRes.status === 403 ? 403 : 401;
      return NextResponse.json({ error: backendError(data, 'Incorrect email / Staff ID or password') }, { status });
    }

    const user = data.user as SessionUser;
    const apiToken = data.token as string;
    if (!user || !apiToken || !Object.prototype.hasOwnProperty.call(ROLE_HOME, user.role)) {
      return NextResponse.json({ error: 'This login cannot access the dashboards.' }, { status: 403 });
    }

    let sessionToken: string;
    try {
      sessionToken = await createSessionToken(user);
    } catch (err) {
      console.error('Login failed while creating the session token:', err);
      return NextResponse.json({ error: 'Server is misconfigured (missing AUTH_SECRET). Contact an admin.' }, { status: 500 });
    }

    // A temporary password set by the head must be replaced before anything else.
    const mustChangePassword = !!data.mustChangePassword;
    const res = NextResponse.json({ redirectTo: mustChangePassword ? '/change-password' : ROLE_HOME[user.role as Role], mustChangePassword });
    res.cookies.set(SESSION_COOKIE, sessionToken, cookieBase);
    res.cookies.set(TOKEN_COOKIE, apiToken, cookieBase);
    return res;
  }

  // --- Local mode: the built-in demo user store ---
  const user = authenticate(login, password);
  if (!user) {
    return NextResponse.json({ error: 'Incorrect email / Staff ID or password' }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken(user);
  } catch (err) {
    // Most likely AUTH_SECRET isn't set in this environment's variables.
    console.error('Login failed while creating the session token:', err);
    return NextResponse.json({ error: 'Server is misconfigured (missing AUTH_SECRET). Contact an admin.' }, { status: 500 });
  }

  const res = NextResponse.json({ redirectTo: ROLE_HOME[user.role] });
  res.cookies.set(SESSION_COOKIE, token, cookieBase);
  return res;
}
