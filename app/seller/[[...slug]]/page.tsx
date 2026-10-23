import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SellerApp from '../../../components/seller/app/SellerApp';
import { SCREEN_TITLE, parseSellerSlug } from '../../../components/seller/app/routes';
import { requireRole } from '../../../lib/auth';
import { fetchSellerMe, fetchSellerOrders, fetchSellerProducts } from '../../../lib/sellerOrders';
import { sellerForUser } from '../../../data/sellers';
import { usingBackend } from '../../../lib/backend';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug?: string[] };
}

// Every seller screen (/seller, /seller/orders, /seller/orders/123, /seller/stock …) is served
// here, so a link or a refresh opens the right screen with the seller's data, and moving
// between screens in the app needs no further server round trip (see components/seller/app/nav.tsx).
export function generateMetadata({ params }: PageProps): Metadata {
  const route = parseSellerSlug(params.slug);
  return { title: !route || route.screen === 'home' ? 'Manikstu Seller' : `${SCREEN_TITLE[route.screen]} · Manikstu Seller` };
}

export default async function SellerPage({ params }: PageProps) {
  if (!parseSellerSlug(params.slug)) notFound();
  const user = await requireRole('seller');

  // In live mode the seller comes from the backend (/seller/me), keyed by the
  // signed-in user — not the sample SELLERS list. Offline falls back to it.
  const me = usingBackend() ? await fetchSellerMe() : null;
  const seller = usingBackend() ? me?.seller ?? null : sellerForUser(user);
  if (!seller) {
    return (
      <main className="login-main">
        <div className="login-card">
          <h1>No seller account</h1>
          <p className="login-sub">Your login is not linked to a seller. Please contact Manikstu.</p>
          <form action="/api/auth/logout" method="post" style={{ marginTop: 18 }}>
            <button type="submit" className="btn-secondary">Log out</button>
          </form>
        </div>
      </main>
    );
  }

  // Everything the seller sees comes from the CRM backend: their own catalogue
  // and the orders that contain their products (including website orders that
  // arrived through the integration endpoint). No sample data — the dashboard
  // starts empty until real products and orders exist.
  const backend = await fetchSellerOrders();
  const products = me?.products ?? (await fetchSellerProducts()) ?? [];
  const orders = backend?.orders ?? [];
  const mixedOrderIds = backend?.mixedOrderIds ?? [];

  // First guess at the layout from the browser, so phones get the app layout on the first paint.
  const h = headers();
  const mobileGuess = h.get('sec-ch-ua-mobile') === '?1' || /Mobi|Android|iPhone|iPod|iPad|Tablet/i.test(h.get('user-agent') ?? '');

  return (
    <SellerApp
      user={user}
      seller={seller}
      initialOrders={orders}
      initialProducts={products ?? []}
      mixedOrderIds={mixedOrderIds}
      live={usingBackend()}
      mobileGuess={mobileGuess}
    />
  );
}
