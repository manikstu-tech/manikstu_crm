import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../../../lib/backend';

export const dynamic = 'force-dynamic';

// One telecalling sale and the order it was taken as (items, payment, status history), for the Sales page's
// View details. Read-only; the backend checks who may see it (an executive only their own sales).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!usingBackend()) return NextResponse.json({ error: 'Order details need the CRM backend.' }, { status: 400 });
  if (!/^\d+$/.test(params.id)) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const r = await backendCall(`/tracker/sales/${params.id}/order`, { token });
    return await relay(r, 'Could not load the order details.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
