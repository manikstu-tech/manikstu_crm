import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiUser } from '../../../../../lib/auth';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../../lib/backend';

export const dynamic = 'force-dynamic';

// Super admin (developer): update an account's email / active flag.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
      const r = await backendCall(`/admin/users/${params.id}`, { method: 'PATCH', token, body });
      return await relay(r, 'Could not update the account.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }
  if (!(await apiUser('developer'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return NextResponse.json({ error: 'Account management needs the live backend.' }, { status: 501 });
}

// Super admin (developer): delete an account.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (usingBackend()) {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    try {
      const r = await backendCall(`/admin/users/${params.id}`, { method: 'DELETE', token });
      return await relay(r, 'Could not delete the account.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }
  if (!(await apiUser('developer'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return NextResponse.json({ error: 'Account management needs the live backend.' }, { status: 501 });
}
