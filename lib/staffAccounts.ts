import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { hashPassword } from './passwords';

// Telecalling staff accounts recorded by the telecalling head on the Staff onboarding page.
// Staff can't sign in with these yet: that needs the backend (docs/backend-staff-onboarding.md).
// Until then they're kept in a local JSON file. Server-only: never import from client code.

export interface StaffAccount {
  id: string;
  staffId: string;
  name: string;
  mobile: string;
  email: string | null;
  region: string;
  verticalIds: number[];
  dailyTarget: number;
  passwordHash: string;
  /** Temporary password from the head: the staff member must set their own at first sign-in. */
  mustChangePassword: boolean;
  isActive: boolean;
  detailsShared: boolean;
  trainingDone: boolean;
  createdAt: string;
  createdBy: string;
  passwordResetAt: string | null;
}

/** What the browser may see: everything except the password hash. */
export type PublicStaffAccount = Omit<StaffAccount, 'passwordHash'>;

export interface NewStaffInput {
  name: string;
  mobile: string;
  email: string | null;
  region: string;
  verticalIds: number[];
  dailyTarget: number;
  password: string;
}

const FILE = path.join(process.cwd(), '.data', 'staff-accounts.json');
/** Staff IDs up to here are used by the existing telecallers; new ones start above. */
const FIRST_STAFF_NUMBER = 120;

function load(): StaffAccount[] {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as StaffAccount[];
  } catch {
    return [];
  }
}

function save(accounts: StaffAccount[]) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(accounts, null, 2));
  renameSync(tmp, FILE); // replace in one step, so a crash can't leave half a file
}

const now = () => new Date().toISOString();
const toPublic = ({ passwordHash: _hash, ...rest }: StaffAccount): PublicStaffAccount => rest;

export function listAccounts(): PublicStaffAccount[] {
  return load().map(toPublic).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Error message if the mobile or email is already used by another staff account. */
export function duplicateProblem(mobile: string, email: string | null): string | null {
  const accounts = load();
  if (accounts.some(a => a.mobile === mobile)) return 'A staff member with this mobile number already exists.';
  if (email && accounts.some(a => a.email === email)) return 'A staff member with this email already exists.';
  return null;
}

export function createAccount(input: NewStaffInput, createdBy: string): PublicStaffAccount {
  const accounts = load();
  const next = Math.max(FIRST_STAFF_NUMBER - 1, ...accounts.map(a => Number(a.staffId.split('-').pop()) || 0)) + 1;
  const account: StaffAccount = {
    id: `staff-${next}`,
    staffId: `MK-TC-${next}`,
    name: input.name,
    mobile: input.mobile,
    email: input.email,
    region: input.region,
    verticalIds: input.verticalIds,
    dailyTarget: input.dailyTarget,
    passwordHash: hashPassword(input.password),
    mustChangePassword: true,
    isActive: true,
    detailsShared: false,
    trainingDone: false,
    createdAt: now(),
    createdBy,
    passwordResetAt: null,
  };
  save([...accounts, account]);
  return toPublic(account);
}

function update(id: string, change: (a: StaffAccount) => StaffAccount): PublicStaffAccount | null {
  const accounts = load();
  const i = accounts.findIndex(a => a.id === id);
  if (i < 0) return null;
  accounts[i] = change(accounts[i]);
  save(accounts);
  return toPublic(accounts[i]);
}

/** New temporary password from the head; the old one stops being valid. */
export const resetPassword = (id: string, password: string) =>
  update(id, a => ({ ...a, passwordHash: hashPassword(password), mustChangePassword: true, detailsShared: false, passwordResetAt: now() }));

export const setAccountFlags = (id: string, flags: { isActive?: boolean; detailsShared?: boolean; trainingDone?: boolean }) =>
  update(id, a => ({ ...a, ...flags }));

/** Permanently remove a staff account. Returns false if the id wasn't found. */
export function removeAccount(id: string): boolean {
  const accounts = load();
  const next = accounts.filter(a => a.id !== id);
  if (next.length === accounts.length) return false;
  save(next);
  return true;
}
