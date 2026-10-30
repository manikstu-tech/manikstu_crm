import type { Metadata } from 'next';
import LoginForm, { type DemoAccount } from '../../components/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in · Manikstu Samarth',
};

// Development only. This page is a server component, so the list reaches the browser only when it is passed below;
// a production build passes nothing, and the passwords are not in its JavaScript.
const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Telecalling Head', email: 'telecalling@manikstu.com', password: 'telecaller123' },
  { label: 'Calling executive', email: 'bikash@manikstu.in', password: 'executive123' },
  { label: 'Seller', email: 'sanjay@manikstu.in', password: 'seller123' },
];

export default function LoginPage() {
  return (
    <div className="login-page">
      <main className="login-main">
        <header className="login-hero">
          <img className="login-logo" src="/brand/samarth-logo.webp" alt="Manikstu" />
          <div className="login-brand-name">Manikstu Samarth</div>
          <div className="login-brand-motto">One CRM for every lead, call and order.</div>
          <span className="login-divider" aria-hidden="true" />
        </header>
        <img className="login-goats" src="/login/goats.webp" alt="" aria-hidden="true" />
        <div className="login-card">
          <h1>Sign in</h1>
          <p className="login-sub">Use your staff email or Staff ID. You&apos;ll be taken to the dashboard for your role.</p>
          <LoginForm demoAccounts={process.env.NODE_ENV !== 'production' ? DEMO_ACCOUNTS : []} />
        </div>
      </main>
      <footer className="login-footer">© 2026 Manikstu Agri Network · Odisha</footer>
    </div>
  );
}
