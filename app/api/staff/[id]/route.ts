import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiUser } from '../../../../lib/auth';
import { removeAccount, setAccountFlags } from '../../../../lib/staffAccounts';
import { TOKEN_COOKIE, backendCall, relay, usingBackend } from '../../../../lib/backend';

// Activate / deactivate a staff member, or tick onboarding steps.
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
      const r = await backendCall(`/telecalling/staff/${params.id}`, { method: 'PATCH', token, body });
      return await relay(r, 'Could not update.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }

  if (!(await apiUser('telecaller'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const flags: { isActive?: boolean; detailsShared?: boolean; trainingDone?: boolean } = {};
  for (const key of ['isActive', 'detailsShared', 'trainingDone'] as const) {
    if (typeof body[key] === 'boolean') flags[key] = body[key] as boolean;
  }
  if (Object.keys(flags).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const account = setAccountFlags(params.id, flags);
  if (!account) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  return NextResponse.json({ data: account });
}

// Delete a staff member.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (usingBackend()) {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    try {
      const r = await backendCall(`/telecalling/staff/${params.id}`, { method: 'DELETE', token });
      return await relay(r, 'Could not delete the staff member.');
    } catch {
      return NextResponse.json({ error: 'Could not reach the server.' }, { status: 502 });
    }
  }

  if (!(await apiUser('telecaller'))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const ok = removeAccount(params.id);
  if (!ok) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
