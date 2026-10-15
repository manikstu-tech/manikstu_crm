import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROLE_HOME, SESSION_COOKIE, SUPER_ROLE, verifySessionToken, type Role, type SessionUser } from './session';

export async function getSession(): Promise<SessionUser | null> {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

/** For API routes: the signed-in user if they have this role (or the super role), otherwise null. */
export async function apiUser(role: Role): Promise<SessionUser | null> {
  const user = await getSession();
  return user && (user.role === role || user.role === SUPER_ROLE) ? user : null;
}

// Server-side guard for pages; middleware already redirects, this is the backstop.
// The super role (developer) may open any role's page.
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.role !== role && user.role !== SUPER_ROLE) redirect(ROLE_HOME[user.role]);
  return user;
}
