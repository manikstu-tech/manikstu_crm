// Signed session cookie. Uses Web Crypto only, so it runs in both the
// Edge middleware and Node route handlers.

export type Role = 'developer' | 'manager' | 'telecaller' | 'calling-executive' | 'seller';

/** The super-admin role: may open every dashboard and section. */
export const SUPER_ROLE: Role = 'developer';

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  role: Role;
  staffId: string;
}

interface SessionPayload extends SessionUser {
  exp: number; // unix seconds
}

export const SESSION_COOKIE = 'mk_session';
export const SESSION_MAX_AGE = 60 * 60 * 8; // one 8-hour shift

export const ROLE_HOME: Record<Role, string> = {
  developer: '/developer',
  manager: '/manager',
  telecaller: '/telecaller',
  'calling-executive': '/calling-executive',
  seller: '/seller',
};

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set in production');
  }
  return DEV_SECRET;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(), fromBase64Url(sig), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!Object.prototype.hasOwnProperty.call(ROLE_HOME, payload.role)) return null;
    const { exp, ...user } = payload;
    return user;
  } catch {
    return null;
  }
}
