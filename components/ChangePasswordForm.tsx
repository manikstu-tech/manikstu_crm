'use client';

import React, { useState } from 'react';

const passwordProblem = (p: string) =>
  p.length < 8 ? 'Password must be at least 8 characters.'
  : !/[a-z]/i.test(p) || !/\d/.test(p) ? 'Password needs at least one letter and one number.'
  : null;

export default function ChangePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== confirm ? 'The two passwords do not match.' : null);
    if (problem) { setError(problem); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not change the password.');
        setSubmitting(false);
        return;
      }
      // Full navigation so middleware sees the session and lands on the role dashboard.
      window.location.assign(data.redirectTo || '/');
    } catch {
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="form-group">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button type="submit" className="btn-primary login-submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}
