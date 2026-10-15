import type { Metadata } from 'next';
import DeveloperDashboard from '../../components/DeveloperDashboard';
import { requireRole } from '../../lib/auth';
import { usingBackend } from '../../lib/backend';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Manikstu Developer · Super Admin',
};

export default async function DeveloperPage() {
  const user = await requireRole('developer');
  return <DeveloperDashboard user={user} backend={usingBackend()} />;
}
