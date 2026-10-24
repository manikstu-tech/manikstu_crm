import type { Metadata, Viewport } from 'next';
import './seller-app.css';

// The seller area is an installable app (PWA): manifest, icons and a full-screen viewport
// that respects notches and the on-screen keyboard. Other dashboards are unaffected.

export const metadata: Metadata = {
  title: 'Manikstu Seller',
  description: 'Manage orders, stock, deliveries and payouts for your products on Manikstu.',
  applicationName: 'Manikstu Seller',
  manifest: '/seller.webmanifest',
  appleWebApp: { capable: true, title: 'Manikstu Seller', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#F8F6EE',
  colorScheme: 'light',
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
