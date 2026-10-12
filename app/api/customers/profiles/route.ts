import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Several farmer profiles at once (by a comma-separated phone list), for the Regional
// report's farmer-details download. Proxied to the CRM backend.

export async function GET(request: Request) {
  if (!usingBackend()) return NextResponse.json({ error: 'No backend configured.' }, { status: 400 });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const phones = new URL(request.url).searchParams.get('phones');
  try {
    const r = await backendCall('/customers/profiles', { token, query: { phones } });
    return await relay(r, 'Could not load farmer profiles.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
