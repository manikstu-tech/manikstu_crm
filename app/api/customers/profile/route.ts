import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

export const dynamic = 'force-dynamic';

// A farmer's profile (land + crops + livestock), keyed by phone, for the Regional
// report's farmer drawer. GET reads it, PATCH saves it (creating it if the phone has
// none yet). Proxied to the CRM backend.

function guard(): { token: string } | NextResponse {
  if (!usingBackend()) return NextResponse.json({ error: 'No backend configured.' }, { status: 400 });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  return { token };
}

export async function GET(request: Request) {
  const g = guard();
  if (g instanceof NextResponse) return g;
  const phone = new URL(request.url).searchParams.get('phone');
  try {
    const r = await backendCall('/customers/profile', { token: g.token, query: { phone } });
    return await relay(r, 'Could not load the farmer profile.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const g = guard();
  if (g instanceof NextResponse) return g;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const r = await backendCall('/customers/profile', { method: 'PATCH', token: g.token, body });
    return await relay(r, 'Could not save the farmer profile.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
