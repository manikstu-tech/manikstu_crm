import { scryptSync, timingSafeEqual } from 'crypto';
import type { SessionUser } from './session';

// Demo user store. Replace with a database lookup before going live.
// passwordHash is "salt:scrypt(password, salt, 32)" in hex.
interface UserRecord extends SessionUser {
  email: string;
  passwordHash: string;
}

const USERS: UserRecord[] = [
  {
    id: 'u-mgr-042',
    email: 'manager@manikstu.com',
    name: 'Smurti Nayak',
    initials: 'SN',
    role: 'manager',
    staffId: 'MNK-MGR-042',
    passwordHash: '418711d3c11629857386cd13a5caa7cb:edf52beb1f3498d3abd6d40702ad4884a1bd4262f72276c01931f1873a0348d4',
  },
  {
    id: 'u-tl-101',
    email: 'telecalling@manikstu.com',
    name: 'Pradeep Mohanty',
    initials: 'PM',
    role: 'telecaller', // telecalling head: sees the whole telecalling team
    staffId: 'MK-TL-101',
    // telecaller123
    passwordHash: 'f715cb64b374a5f7e4ccba7db216329b:815b389ee853fa0520f6f24f51f52257c8e603873ccd5ede2f01139b330d3b9f',
  },
  {
    id: 'u-ce-212',
    email: 'bikash@manikstu.in',
    name: 'Bikash Pradhan',
    initials: 'BP',
    role: 'calling-executive',
    staffId: 'MK-CE-212',
    // executive123
    passwordHash: '96183426ca84d4bb62fb14fe7018b892:5f1bb04d9d96627a4625014f1c179396d7a10f118098256a0da2418598fe9daa',
  },
  {
    id: 'u-sl-301',
    email: 'sanjay@manikstu.in',
    name: 'Sanjay Rath',
    initials: 'SR',
    role: 'seller', // Odisha Herbal Vet Labs, see data/sellers.ts
    staffId: 'MK-SL-301',
    // seller123
    passwordHash: '871068dc821b03201e757e5be590d54a:f7d18c6ca8980dd606dfaa54f29a6375637e2b35012b6b9baf5f41fa7b18855a',
  },
];

function passwordMatches(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function authenticate(email: string, password: string): SessionUser | null {
  const record = USERS.find(u => u.email === email.trim().toLowerCase());
  if (!record || !passwordMatches(password, record.passwordHash)) return null;
  const { email: _email, passwordHash: _hash, ...user } = record;
  return user;
}
