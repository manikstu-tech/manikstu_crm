// The seller's page menu: one list for the desktop sidebar and the phone drawer, so the two always offer the same pages.
// Seller profile, Settings and Help & support are not listed here; they stay on the phone app's More screen.

import { BarChart3, Boxes, LayoutDashboard, MapPin, ShoppingCart, Truck, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ScreenKey } from './routes';

export interface SellerMenuItem { screen: ScreenKey; label: string; href: string; icon: LucideIcon; count?: number }
export interface SellerMenuGroup { label: string; items: SellerMenuItem[] }

export interface SellerMenuCounts { toConfirm: number; stockAlerts: number; shipments: number; payoutsDue: number }

export function sellerMenuGroups(c: SellerMenuCounts): SellerMenuGroup[] {
  return [
    { label: 'Overview', items: [{ screen: 'home', label: 'Dashboard', href: '/seller', icon: LayoutDashboard }] },
    {
      label: 'Sell',
      items: [
        { screen: 'orders', label: 'Orders', href: '/seller/orders', icon: ShoppingCart, count: c.toConfirm },
        { screen: 'stock', label: 'Stock', href: '/seller/stock', icon: Boxes, count: c.stockAlerts },
        { screen: 'tracking', label: 'Tracking', href: '/seller/tracking', icon: Truck, count: c.shipments },
        { screen: 'regional', label: 'Regional report', href: '/seller/regional', icon: MapPin },
      ],
    },
    {
      label: 'Money',
      items: [
        { screen: 'payouts', label: 'Payouts', href: '/seller/payouts', icon: Wallet, count: c.payoutsDue },
        { screen: 'reports', label: 'Reports', href: '/seller/reports', icon: BarChart3 },
      ],
    },
  ];
}
