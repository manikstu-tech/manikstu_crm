import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Not live yet: shows a "Soon" tag. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  groups: NavGroup[];
  activePage: string;
  onSelectPage: (pageKey: string) => void;
}

/**
 * Cream sidebar shared by every dashboard: logo, then grouped pages with icons and counts.
 * On phones the page list is hidden behind a ☰ button and opens as a vertical drawer.
 */
export default function Sidebar({ groups, activePage, onSelectPage }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const active = groups.flatMap(g => g.items).find(i => i.key === activePage);

  // Esc closes the drawer; the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <aside className={`sidebar ${open ? 'menu-open' : ''}`}>
      <div className="sidebar-brand">
        <img className="brand-logo" src="/brand/manikstu-logo-horizontal.png" alt="Manikstu" />
      </div>

      {/* Phones only: the current page's name and the button that opens the menu. */}
      <div className="nav-toggle-row">
        <button
          type="button"
          className="nav-toggle"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
        <span className="nav-toggle-current">{active?.label ?? 'Menu'}</span>
      </div>

      <div className="nav-backdrop" onClick={() => setOpen(false)} aria-hidden />

      <nav className="sidebar-nav" aria-label="Pages">
        <div className="nav-drawer-head">
          <span>Menu</span>
          <button type="button" className="nav-toggle" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        {groups.map(group => (
          <div key={group.label} className="nav-group">
            <div className="nav-group-label">{group.label}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  className={`nav-item ${activePage === item.key ? 'active' : ''}`}
                  onClick={() => { onSelectPage(item.key); setOpen(false); }}
                >
                  <Icon className="nav-icon" size={17} />
                  {item.label}
                  {item.soon && <span className="soon">Soon</span>}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="count" suppressHydrationWarning>{item.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
