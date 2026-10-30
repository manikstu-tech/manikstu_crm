import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Seller adds or corrects the courier and tracking number of an order already confirmed. The backend checks the
// courier and the tracking number. In local (sample-data) mode it's a no-op so the UI works.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!usingBackend()) {
    return NextResponse.json({ ok: true, local: true });
  }

  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const r = await backendCall(`/seller/orders/${encodeURIComponent(params.id)}/shipment`, {
      method: 'PATCH',
      token,
      body,
    });
    return await relay(r, 'Could not save the courier details.');
  } catch {
    return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
  }
}
