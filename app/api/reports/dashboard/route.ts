import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Business Dashboard: farmers, sales, regions, orders and leads for one period, counted by the backend.
// Only the period parameters are passed on; the backend validates them and checks the role.
export async function GET(request: Request) {
  if (!usingBackend()) return NextResponse.json({ error: 'No backend configured.' }, { status: 400 });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  try {
    const r = await backendCall('/reports/dashboard', {
      token,
      query: { period: params.get('period') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' },
    });
    return await relay(r, 'Could not load the dashboard.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
