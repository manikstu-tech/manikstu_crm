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
