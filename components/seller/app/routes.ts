// Every screen of the seller app and its URL. Shared by the server route (app/seller/[[...slug]])
// and the client router, so a deep link and an in-app tap always resolve to the same screen.

export type ScreenKey =
  | 'home'
  | 'orders'
  | 'order'
  | 'stock'
  | 'tracking'
  | 'regional'
  | 'payouts'
  | 'reports'
  | 'more'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'help';

export interface SellerRoute {
  screen: ScreenKey;
  /** Order id for the order details screen. */
  id?: number;
}

/** Bottom-navigation tab each screen belongs to (screens reached from More light up More). */
export const SCREEN_TAB: Record<ScreenKey, 'home' | 'orders' | 'stock' | 'tracking' | 'more'> = {
  home: 'home',
  orders: 'orders',
  order: 'orders',
  stock: 'stock',
  tracking: 'tracking',
  regional: 'more',
  payouts: 'more',
  reports: 'more',
  more: 'more',
  notifications: 'more',
  profile: 'more',
  settings: 'more',
  help: 'more',
};

export const SCREEN_TITLE: Record<ScreenKey, string> = {
  home: 'Home',
  orders: 'Orders',
  order: 'Order details',
  stock: 'Stock',
  tracking: 'Tracking',
  regional: 'Regional report',
  payouts: 'Payouts',
  reports: 'Reports',
  more: 'More',
  notifications: 'Notifications',
  profile: 'Seller profile',
  settings: 'Settings',
  help: 'Help & support',
};

/** Screens that sit one level below a tab: they show a back button instead of the logo. */
export const SUB_SCREENS: ReadonlySet<ScreenKey> = new Set<ScreenKey>(['order', 'regional', 'payouts', 'reports', 'notifications', 'profile', 'settings', 'help']);

/** Where the back button goes when there is no earlier screen in this session (opened from a link). */
export const BACK_FALLBACK: Partial<Record<ScreenKey, string>> = {
  order: '/seller/orders',
  regional: '/seller/more',
  payouts: '/seller/more',
  reports: '/seller/more',
  notifications: '/seller',
  profile: '/seller/more',
  settings: '/seller/more',
  help: '/seller/more',
};

const SIMPLE: Record<string, ScreenKey> = {
  orders: 'orders',
  stock: 'stock',
  tracking: 'tracking',
  regional: 'regional',
  payouts: 'payouts',
  reports: 'reports',
  more: 'more',
  notifications: 'notifications',
  profile: 'profile',
  settings: 'settings',
  help: 'help',
};

/** The screen for a URL path under /seller, or null when there is no such screen. */
export function parseSellerPath(pathname: string): SellerRoute | null {
  const parts = pathname.replace(/^\/seller\/?/, '').split('/').filter(Boolean);
  return parseSellerSlug(parts);
}

/** The screen for the catch-all route's slug segments. */
export function parseSellerSlug(slug: string[] | undefined): SellerRoute | null {
  const parts = slug ?? [];
  if (parts.length === 0) return { screen: 'home' };
  if (parts.length === 1 && SIMPLE[parts[0]]) return { screen: SIMPLE[parts[0]] };
  if (parts.length === 2 && parts[0] === 'orders' && /^\d{1,12}$/.test(parts[1])) return { screen: 'order', id: Number(parts[1]) };
  return null;
}

/** Desktop sidebar keys (the existing dashboard's page names) for each screen. */
export const DESKTOP_PAGE: Record<ScreenKey, string> = {
  home: 'overview',
  orders: 'orders',
  order: 'orders',
  stock: 'stock',
  tracking: 'tracking',
  regional: 'regional',
  payouts: 'payouts',
  reports: 'reports',
  more: 'more',
  notifications: 'notifications',
  profile: 'profile',
  settings: 'settings',
  help: 'help',
};

export const DESKTOP_HREF: Record<string, string> = {
  overview: '/seller',
  orders: '/seller/orders',
  stock: '/seller/stock',
  tracking: '/seller/tracking',
  regional: '/seller/regional',
  payouts: '/seller/payouts',
  reports: '/seller/reports',
  notifications: '/seller/notifications',
  profile: '/seller/profile',
  settings: '/seller/settings',
  help: '/seller/help',
};
