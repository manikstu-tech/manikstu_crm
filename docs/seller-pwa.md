# Manikstu Seller app (mobile PWA)

The seller area (`/seller`) is an installable Progressive Web App. Phones and tablets
(under 1024 px wide) get an app layout with a bottom tab bar; wider screens keep the
original desktop dashboard with its sidebar. Both layouts share one data store, so they
always behave the same.

## Screens and URLs

| URL | Screen |
|---|---|
| `/seller` | Home: sales, orders needing action, sales chart, low stock, top products |
| `/seller/orders` (`?tab=new\|confirmed\|all\|closed`) | Orders: search, filters, confirm / reject, next step |
| `/seller/orders/{id}` | Order details: customer, address, items, payment, courier, history |
| `/seller/stock` (`?filter=low\|out\|restock`, `?add=1`) | Stock: products, restock, add / edit product, movements |
| `/seller/tracking` (`?tab=…`, `?order={order number}`) | Tracking: progress, courier, estimate, next step |
| `/seller/regional` | Sales by state, district and town; downloads |
| `/seller/payouts` (`?tab=hold\|paid`) | Payouts (estimated from the payout schedule) |
| `/seller/reports` | Trends, top products, stock summary; Excel / PDF downloads |
| `/seller/more`, `/notifications`, `/profile`, `/settings`, `/help` | Account screens |

Every one of these is served by **one** route, `app/seller/[[...slug]]/page.tsx`, which loads
the seller's data on the server. Moving between screens inside the app only changes the URL
with the History API (`components/seller/app/nav.tsx`). Next.js 14.2 keeps
`usePathname`/`useSearchParams` in step with it, so:

- screen changes are instant and need no server round trip (they keep working offline);
- links, refresh, and the back / forward buttons work, and filters live in the URL;
- the phone's back button closes an open bottom sheet before leaving the screen.

## Code map

| Path | What it does |
|---|---|
| `components/seller/app/SellerProvider.tsx` | All seller data and actions (moved out of `SellerDashboard`): order status changes, courier details, restock, product add / edit, alerts, refresh, session expiry |
| `components/seller/app/SellerApp.tsx` | Picks the layout by screen width; registers the service worker |
| `components/seller/app/routes.ts`, `nav.tsx` | Route table and in-app navigation |
| `components/SellerDashboard.tsx` | Desktop layout (sidebar, top bar, the original pages and dialogs) |
| `components/seller/mobile/*` | Phone layout: shell, screens, sheets, charts, UI kit |
| `components/seller/ProductForm.tsx` | The product form, desktop and phone layouts |
| `app/seller/seller-app.css` | Design tokens and components, all scoped to `.sx` |
| `app/seller/layout.tsx` | Manifest link, icons, theme colour, viewport (safe areas, keyboard) |
| `lib/pwa/client.ts` | Online status, install prompt, service worker registration |
| `public/seller.webmanifest`, `public/sw.js`, `public/offline.html`, `public/icons/` | PWA files |

## Offline behaviour and caching

`public/sw.js` keeps only the app's own files: versioned `/_next/static` scripts and styles,
icons, product pictures and fonts. It **never** stores pages, router data (`RSC`) or `/api`
answers, because those carry the signed-in seller's orders. With no connection:

- an open app keeps showing what it had loaded, and switching screens still works;
- saving anything (confirm, restock, edit) is blocked with a clear message;
- opening or reloading a page shows `offline.html`, which reloads itself when the connection returns.

The worker is registered only in production builds (`next build`): `next dev` serves
unversioned files that must not be cached. Set `NEXT_PUBLIC_ENABLE_SW=1` to try it in dev.
When changing caching rules, bump `VERSION` in `sw.js`; old caches are deleted on activation.

## Installing and testing

1. Build and run: `npm run build && npm start` (served over HTTPS in production;
   `localhost` also counts as secure for testing).
2. **Android (Chrome):** open `/seller`, sign in as a seller. Use the **Install** card on Home,
   More → *Install the app*, or the browser menu → *Install app*. The app opens full screen with
   long-press shortcuts for New orders, Low stock and Tracking.
3. **iPhone / iPad (Safari):** Share → *Add to Home Screen*. iOS has no install prompt, so the
   app shows these steps instead.
4. **Desktop Chrome / Edge:** the install icon in the address bar.
5. **Checks in Chrome DevTools → Application:** *Manifest* shows no errors and the icons;
   *Service workers* shows `/sw.js` activated; *Cache storage* holds only
   `manikstu-seller-static-*` and `manikstu-seller-runtime-*` with no `/api` or `/seller` pages.
   Tick *Offline* in the Network panel to see the offline banner and page.
6. Lighthouse (*Progressive Web App* / *Best practices*) can be run on `/seller`.

## Settings

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_SELLER_SUPPORT_PHONE`, `…_WHATSAPP`, `…_EMAIL` | Contacts on Help & support. When none is set, the screen says to contact the account manager. |
| `NEXT_PUBLIC_ENABLE_SW` | `1` turns the service worker on in `next dev`. |

## Backend work still needed

The app shows only what the CRM backend provides and labels anything worked out on the device.
These gaps remain:

1. **Courier and tracking number are not stored.** The seller types them when confirming an
   order, but `PATCH /seller/orders/{id}/status` only takes `status`, so they are kept in the
   app's memory until it closes. *Needed:* store `courier` and `tracking_number` with the order
   (for example accept them in that PATCH, or add `PUT /seller/orders/{id}/shipment`) and return
   them in `GET /seller/orders`.
2. **"Out for delivery" is device-only.** The backend has no status for it. *Needed:* an
   `out_for_delivery` status (or a shipment event) so it is saved and shared.
3. **No courier tracking data.** Delivery dates are an estimate (5 days after shipping) and
   "Late" is based on it. *Needed:* courier integration (scan events, promised date) to show real
   progress.
4. **No settlement records.** Payout status is worked out from delivery dates and the weekly
   schedule, and the app says so ("Past payout date", estimated). *Needed:* a payouts endpoint
   (amount, status, paid date, bank reference) to show confirmed payouts.
5. **No stock history.** Stock movements list only this session's restocks and recent
   shipments. *Needed:* `GET /seller/products/{id}/movements` (or one list for all products).
6. **Sellers can't change their password or edit their profile.** The app tells them to contact
   their account manager. *Needed:* seller-scoped endpoints for both.
7. **No push notifications.** Alerts are worked out in the app while it is open. *Needed:* Web
   Push (VAPID keys plus a subscription endpoint) for alerts when the app is closed.
8. **Product images are sent as data URLs inside JSON** (unchanged from before). A multipart
   upload endpoint would make large images more reliable on mobile data.
