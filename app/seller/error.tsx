'use client';

import { startTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Something failed while loading the seller app (for example the CRM did not answer).
export default function SellerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <main className="sx sx-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: 24 }}>
      <div className="sx-card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: 28 }} role="alert">
        <img src="/brand/manikstu-emblem.png" alt="" width={56} height={56} style={{ margin: '0 auto 12px', display: 'block' }} />
        <h1 style={{ fontFamily: 'var(--sx-serif)', fontSize: 22, color: 'var(--sx-forest)', marginBottom: 8 }}>
          {offline ? "You're offline" : "Couldn't load your dashboard"}
        </h1>
        <p className="sx-hint" style={{ fontSize: 14, marginBottom: 18 }}>
          {offline ? 'Connect to the internet, then try again.' : 'The Manikstu server did not respond. Please try again in a moment.'}
        </p>
        <div className="sx-actions">
          <form action="/api/auth/logout" method="post"><button type="submit" className="sx-btn sx-btn-secondary sx-btn-md sx-btn-block">Log out</button></form>
          <button type="button" className="sx-btn sx-btn-primary sx-btn-md" onClick={() => startTransition(() => { router.refresh(); reset(); })}>Try again</button>
        </div>
      </div>
    </main>
  );
}
