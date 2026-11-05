import React from 'react';

/** The company line shown at the foot of every Samarth page. */
export const COPYRIGHT = '© 2026 Manikstu Agro Private Limited';

export default function SiteFooter({ className = 'site-footer' }: { className?: string }) {
  return (
    <footer className={className}>
      <div>{COPYRIGHT}</div>
    </footer>
  );
}
