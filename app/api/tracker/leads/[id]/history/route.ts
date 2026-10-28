import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../../../lib/backend';

export const dynamic = 'force-dynamic';

// A lead's assignment and edit history (head and manager), for the Edit lead window. Read-only.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!usingBackend()) return NextResponse.json({ error: 'History needs the CRM backend.' }, { status: 400 });
  if (!/^\d+$/.test(params.id)) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const r = await backendCall(`/tracker/leads/${params.id}/history`, { token });
    return await relay(r, 'Could not load the lead history.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
