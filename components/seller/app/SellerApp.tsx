'use client';

// Root of the seller app: one data store, two layouts. Phones and tablets get the app layout with
// bottom navigation; wide screens keep the desktop dashboard with its sidebar.

import React, { useEffect } from 'react';
import type { CatalogProduct } from '../../../data/catalogProducts';
import type { SalesOrder } from '../../../data/managerDashboard';
import type { Seller } from '../../../data/sellers';
import type { SessionUser } from '../../../lib/session';
import { MOBILE_QUERY, registerServiceWorker, useMediaQuery } from '../../../lib/pwa/client';
import SellerDashboard from '../../SellerDashboard';
import MobileShell from '../mobile/MobileShell';
import { SellerNavProvider } from './nav';
import { SellerProvider } from './SellerProvider';

interface Props {
  user: SessionUser;
  seller: Seller;
  initialOrders: SalesOrder[];
  initialProducts: CatalogProduct[];
  mixedOrderIds: number[];
  live: boolean;
  /** The server's guess from the browser (phone or not), used until the real screen width is known. */
  mobileGuess: boolean;
}

function Layout(props: Props) {
  const isMobile = useMediaQuery(MOBILE_QUERY, props.mobileGuess);
  useEffect(() => { registerServiceWorker(); }, []);
  return (
    <SellerProvider {...props} isMobile={isMobile}>
      {isMobile ? <MobileShell /> : <SellerDashboard />}
    </SellerProvider>
  );
}

export default function SellerApp(props: Props) {
  return (
    <SellerNavProvider>
      <Layout {...props} />
    </SellerNavProvider>
  );
}
