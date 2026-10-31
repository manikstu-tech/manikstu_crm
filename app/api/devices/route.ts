import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../lib/backend';

export const dynamic = 'force-dynamic';

// The Samarth app's push token for this phone, saved against the signed-in user
// (the backend removes it again when they sign out).
async function forward(request: Request, method: 'POST' | 'DELETE') {
  if (!usingBackend()) return NextResponse.json({ ok: false, skipped: 'No backend configured.' });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    return await relay(await backendCall('/devices', { method, token, body }), 'Could not save this phone for notifications.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}

export const POST = (request: Request) => forward(request, 'POST');
export const DELETE = (request: Request) => forward(request, 'DELETE');
