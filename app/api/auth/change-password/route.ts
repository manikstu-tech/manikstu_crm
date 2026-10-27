import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/auth';
import { ROLE_HOME } from '../../../../lib/session';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Set the signed-in user's own password and clear the force-change flag. Proxies to the
// CRM backend; the offline demo's accounts have fixed passwords, so there is nothing to change.
export async function POST(request: Request) {
  if (!usingBackend()) return NextResponse.json({ error: 'No backend configured.' }, { status: 400 });
  const user = await getSession();
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!user || !token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let password = '';
  try {
    password = String((await request.json()).password ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const r = await backendCall('/auth/change-password', { method: 'POST', token, body: { password } });
    if (!r.ok) return await relay(r, 'Could not change the password.');
    return NextResponse.json({ redirectTo: ROLE_HOME[user.role] });
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
