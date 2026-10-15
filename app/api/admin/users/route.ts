import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiUser } from '../../../../lib/auth';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Super admin (developer): list every staff account.
export async function GET() {
  if (usingBackend()) {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    try {
      const r = await backendCall('/admin/users', { token });
      return await relay(r, 'Could not load accounts.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }
  if (!(await apiUser('developer'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  // Offline demo has no live user store to manage.
  return NextResponse.json({ error: 'Account management needs the live backend.' }, { status: 501 });
}

// Super admin (developer): create a new account.
export async function POST(request: Request) {
  if (usingBackend()) {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    try {
      const r = await backendCall('/admin/users', { method: 'POST', token, body });
      return await relay(r, 'Could not create the account.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }
  if (!(await apiUser('developer'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return NextResponse.json({ error: 'Account management needs the live backend.' }, { status: 501 });
}
