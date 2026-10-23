'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
}

/**
 * The demo accounts come in as a prop from the login page (a server component), which passes them only in
 * development. Keeping the list out of this browser component means production JavaScript never contains them.
 */
export default function LoginForm({ demoAccounts = [] }: { demoAccounts?: DemoAccount[] }) {
  const [login, setLogin] = useState('');
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
        body: JSON.stringify({ login, password }),
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
          <label htmlFor="login">Email or Staff ID</label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            required
            placeholder="name@manikstu.in or MK-TC-120"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
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

      {demoAccounts.length > 0 && (
        <div className="demo-accounts">
          <div className="demo-accounts-label">Demo accounts (dev only)</div>
          {demoAccounts.map(acc => (
            <button
              key={acc.email}
              type="button"
              className="demo-account"
              onClick={() => { setLogin(acc.email); setPassword(acc.password); setError(null); }}
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
