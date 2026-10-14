'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Telecalling Head', email: 'telecalling@manikstu.com', password: 'telecaller123' },
  { label: 'Calling executive', email: 'bikash@manikstu.in', password: 'executive123' },
  { label: 'Seller', email: 'sanjay@manikstu.in', password: 'seller123' },
];

export default function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign in failed');
        setSubmitting(false);
        return;
      }
      // Full navigation so middleware sees the new session cookie.
      window.location.assign(data.redirectTo);
    } catch {
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            placeholder="name@manikstu.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" className="btn-primary login-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {showDemoAccounts && (
        <div className="demo-accounts">
          <div className="demo-accounts-label">Demo accounts (dev only)</div>
          {DEMO_ACCOUNTS.map(acc => (
            <button
              key={acc.email}
              type="button"
              className="demo-account"
              onClick={() => { setEmail(acc.email); setPassword(acc.password); setError(null); }}
            >
              <strong>{acc.label}</strong>
              <span>{acc.email} · {acc.password}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
