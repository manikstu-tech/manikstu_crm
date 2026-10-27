import type { Metadata } from 'next';
import ChangePasswordForm from '../../components/ChangePasswordForm';
import HeaderFrieze from '../../components/HeaderFrieze';
import { getSession } from '../../lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set your password · Manikstu Samarth',
};

export default async function ChangePasswordPage() {
  // Any signed-in user may set their own password; guests go to login.
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <div className="login-page">
      <HeaderFrieze />
      <main className="login-main">
        <div className="login-card">
          <div className="login-brand">
            <img className="login-logo" src="/brand/samarth-logo.webp" alt="Manikstu" />
            <div>
              <div className="login-brand-name">Manikstu Samarth</div>
              <div className="login-brand-motto">One CRM for every lead, call and order.</div>
            </div>
          </div>
          <h1>Set your password</h1>
          <p className="login-sub">Choose a password of your own before you continue, {user.name}.</p>
          <ChangePasswordForm />
        </div>
      </main>
      <footer className="site-footer">
        <div>© 2026 Manikstu Agri Network · Odisha</div>
      </footer>
    </div>
  );
}
