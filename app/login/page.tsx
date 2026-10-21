import type { Metadata } from 'next';
import LoginForm from '../../components/LoginForm';
import HeaderFrieze from '../../components/HeaderFrieze';
import FooterFrieze from '../../components/FooterFrieze';

export const metadata: Metadata = {
  title: 'Sign in · Manikstu Samarth',
};

export default function LoginPage() {
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
          <h1>Sign in</h1>
          <p className="login-sub">Use your staff email or Staff ID. You&apos;ll be taken to the dashboard for your role.</p>
          <LoginForm showDemoAccounts={process.env.NODE_ENV !== 'production'} />
        </div>
      </main>
      <FooterFrieze />
      <footer className="site-footer">
        <div>© 2026 Manikstu Agri Network · Odisha</div>
      </footer>
    </div>
  );
}
