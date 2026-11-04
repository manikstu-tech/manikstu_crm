import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DeliveryDetails from '../components/seller/DeliveryDetails';
import { sellerMenuGroups } from '../components/seller/app/menu';
import { parseSellerSlug } from '../components/seller/app/routes';
import { SELLERS } from '../data/sellers';

describe('Tracking details: Delivering to', () => {
  const order = { customer_name: 'QA Test Farmer Multi', phone: '9876501234', address: 'Plot 3, Test Road', city: 'Bhubaneswar', state: 'Odisha', pincode: '751001' };

  it('shows the name, complete address and mobile', () => {
    const html = renderToStaticMarkup(<DeliveryDetails order={order} />);
    assert.match(html, /QA Test Farmer Multi/);
    assert.match(html, /Plot 3, Test Road, Bhubaneswar, Khordha, Odisha – 751001/);
    assert.match(html, /\+91 9876501234/);
  });

  it('says so when details are missing, and prints no blanks', () => {
    const html = renderToStaticMarkup(<DeliveryDetails order={{ customer_name: null, phone: null, address: null, city: null, state: null, pincode: null }} />);
    assert.equal(html.match(/Not available/g)?.length, 3);
    assert.doesNotMatch(html, /null|undefined/);
  });

  it('escapes what was typed into an order', () => {
    const html = renderToStaticMarkup(<DeliveryDetails order={{ ...order, address: '<img src=x onerror=alert(1)>' }} />);
    assert.doesNotMatch(html, /<img/);
  });
});

describe('Seller sidebar', () => {
  const groups = sellerMenuGroups({ toConfirm: 2, stockAlerts: 5, shipments: 14, payoutsDue: 1 });
  const labels = groups.flatMap(g => g.items.map(i => i.label));

  it('has no ACCOUNT section', () => {
    assert.deepEqual(groups.map(g => g.label), ['Overview', 'Sell', 'Money']);
  });

  it('has none of its three items', () => {
    for (const gone of ['Seller profile', 'Settings', 'Help & support']) assert.ok(!labels.includes(gone), gone);
  });

  it('keeps every other page and its count', () => {
    assert.deepEqual(labels, ['Dashboard', 'Orders', 'Stock', 'Tracking', 'Regional report', 'Payouts', 'Reports']);
    const count = (label: string) => groups.flatMap(g => g.items).find(i => i.label === label)?.count;
    assert.deepEqual(['Orders', 'Stock', 'Tracking', 'Payouts'].map(count), [2, 5, 14, 1]);
  });

  it('points every item at a screen that exists', () => {
    for (const item of groups.flatMap(g => g.items)) {
      const slug = item.href.replace(/^\/seller\/?/, '').split('/').filter(Boolean);
      assert.equal(parseSellerSlug(slug)?.screen, item.screen, item.href);
    }
  });

  it('leaves the pages themselves working for the links that remain', () => {
    for (const screen of ['profile', 'settings', 'help']) assert.equal(parseSellerSlug([screen])?.screen, screen);
  });
});

describe('Seller company name', () => {
  it('is Manikstu Agro Pvt Ltd, with the seller name unchanged', () => {
    assert.equal(SELLERS[0].business, 'Manikstu Agro Pvt Ltd');
    assert.equal(SELLERS[0].gstin, '21AAJCM6881B1ZM');
    assert.equal(SELLERS[0].owner, 'Sanjay Rath');
  });
});
