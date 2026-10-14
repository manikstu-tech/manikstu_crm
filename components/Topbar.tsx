import React from 'react';
import { Bell, Search, UserRound } from 'lucide-react';
import LogoutButton from './LogoutButton';

interface TopbarProps {
  title: string;
  subtitle: string;
  /** Search box on the left. Leave out on pages with nothing to search: a greeting shows instead. */
  search?: {
    query: string;
    onChange: (query: string) => void;
    onSubmit?: () => void;
    placeholder: string;
  };
  notifications?: { count: number; onToggle: () => void; title: string };
  /** Shown at the start of the tools, e.g. the live-sync indicator. */
  status?: React.ReactNode;
  profile: {
    name: string;
    role: string;
    /** Initials for the avatar; a person icon when left out. */
    initials?: string;
    /** Extra line for the greeting, e.g. staff ID and shift. */
    detail?: string;
  };
}

/** Sticky top card shared by every dashboard: search, tools and profile, then the page title. */
export default function Topbar({ title, subtitle, search, notifications, status, profile }: TopbarProps) {
  return (
    <>
      <div className="topbar-sticky">
        <div className="topbar-card">
          {search ? (
            <form className="search" onSubmit={e => { e.preventDefault(); search.onSubmit?.(); }}>
              <Search size={16} style={{ color: 'var(--ink-soft)' }} />
              <input
                type="text"
                placeholder={search.placeholder}
                value={search.query}
                onChange={e => search.onChange(e.target.value)}
              />
            </form>
          ) : (
            <div className="topbar-greeting">
              <div className="greet">Namaskar, {profile.name.split(' ')[0]}</div>
              {profile.detail && <div className="loc">{profile.detail}</div>}
            </div>
          )}

          <div className="topbar-tools">
            {status}
            {notifications && (
              <button className="icon-btn" title={notifications.title} onClick={notifications.onToggle}>
                <Bell size={18} />
                {notifications.count > 0 && <span className="badge">{notifications.count}</span>}
              </button>
            )}
            <div className="topbar-profile" title={profile.detail}>
              <div className="avatar">{profile.initials ?? <UserRound size={18} />}</div>
              <div>
                <div className="who-name">{profile.name}</div>
                <div className="who-role">{profile.role}</div>
              </div>
            </div>
            <div className="topbar-logout"><LogoutButton /></div>
          </div>
        </div>
      </div>

      <div className="page-head">
        <h1 id="page-title">{title}</h1>
        <div className="sub" id="page-sub">{subtitle}</div>
      </div>
    </>
  );
}
