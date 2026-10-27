'use client';

import React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { NavGroup } from './Sidebar';

interface BottomNavProps {
  /** The dashboard's sidebar pages: icons and counts come from here, so both menus always agree. */
  groups: NavGroup[];
  /** The pages that get a tab (short labels for the bar); every other page is under More. */
  tabs: { key: string; label: string }[];
  activePage: string;
  onSelectPage: (pageKey: string) => void;
  /** More opens the existing page menu (the sidebar drawer). */
  onMore: () => void;
}

/**
 * Phones only (see .bottom-nav in globals.css): thumb-reach tabs for the most used pages, like the seller app.
 * It only switches pages the same way the sidebar does; desktop never shows it.
 */
export default function BottomNav({ groups, tabs, activePage, onSelectPage, onMore }: BottomNavProps) {
  const items = groups.flatMap(g => g.items);
  const onTab = tabs.some(t => t.key === activePage);

  return (
    <nav className="bottom-nav" aria-label="Main pages">
      <div className="bottom-nav-inner">
        {tabs.map(t => {
          const item = items.find(i => i.key === t.key);
          if (!item) return null;
          const Icon = item.icon;
          const active = activePage === t.key;
          const n = item.count ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              className={`bottom-nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={n > 0 ? `${item.label}, ${n}` : item.label}
              onClick={() => onSelectPage(t.key)}
            >
              <span className="bottom-nav-icon">
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
                {n > 0 && <span className="bottom-nav-badge" aria-hidden suppressHydrationWarning>{n > 99 ? '99+' : n}</span>}
              </span>
              <span className="bottom-nav-label">{t.label}</span>
            </button>
          );
        })}
        <button type="button" className={`bottom-nav-item ${onTab ? '' : 'active'}`} aria-label="More pages" aria-haspopup="menu" onClick={onMore}>
          <span className="bottom-nav-icon"><LayoutGrid size={22} strokeWidth={onTab ? 2 : 2.4} aria-hidden /></span>
          <span className="bottom-nav-label">More</span>
        </button>
      </div>
    </nav>
  );
}
