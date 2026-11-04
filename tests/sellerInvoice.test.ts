import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PaymentMethod, PaymentStatus } from '../data/managerDashboard';
import { courierLocked } from '../lib/couriers';
import { mobileTelHref } from '../lib/orderDisplay';
import { sellerInvoiceHtml } from '../lib/sellerInvoice';

const order = {
  order_number: 'TEL-6E1527DEA9457E8C', created_at: '2026-10-22T13:13', customer_name: 'Sachidananda Padhan', phone: '9692337616',
  address: 'At Khaliapadi', city: 'Khalipada', state: 'Odisha', pincode: '767062', payment_method: 'COD' as PaymentMethod, payment_status: 'unpaid' as PaymentStatus,
};
const items = [{ product_name: 'Livtherapy Syrup', quantity: 2, price: 173 }, { product_name: 'Poshak Tatwa', quantity: 1, price: 99.5 }];
const seller = { business: 'Manikstu Agro Pvt Ltd', city: 'Bhubaneswar', gstin: '21AAJCM6881B1ZM' };

describe('sellerInvoiceHtml', () => {
  const html = sellerInvoiceHtml({ order, items, seller });

  it('shows the seller, the order and who it is billed to', () => {
    for (const text of ['Manikstu Agro Pvt Ltd', 'GSTIN 21AAJCM6881B1ZM', 'TEL-6E1527DEA9457E8C', 'Sachidananda Padhan', '767062', '+91 9692337616', 'Cash on delivery', 'Unpaid']) {
      assert.ok(html.includes(text), text);
    }
  });

  it('lists each line and totals them, keeping the paise', () => {
    assert.ok(html.includes('₹346.00'));
    assert.ok(html.includes('₹99.50'));
    assert.ok(html.includes('₹445.50'));
  });

  it('shows the customer nothing about commission or payouts', () => {
    assert.doesNotMatch(html, /commission|payout|you get/i);
  });

  it('cannot be broken by what was typed into an order', () => {
    const attack = sellerInvoiceHtml({
      order: { ...order, customer_name: '<script>alert(1)</script>', address: '<img src=x onerror=alert(1)>' },
      items: [{ product_name: '"><script>alert(2)</script>', quantity: 1, price: 10 }],
      seller,
    });
    assert.doesNotMatch(attack, /<script|<img/);
  });

  it('leaves out what is missing, and prints no blanks', () => {
    const bare = sellerInvoiceHtml({
      order: { ...order, phone: null as unknown as string, address: null as unknown as string, city: null as unknown as string, state: null as unknown as string, pincode: null as unknown as string },
      items, seller: { business: 'Manikstu Agro Pvt Ltd', city: null, gstin: null },
    });
    assert.doesNotMatch(bare, /null|undefined|GSTIN/);
  });

  it('says when other sellers items are left out', () => {
    assert.doesNotMatch(html, /other sellers/);
    assert.match(sellerInvoiceHtml({ order, items, seller, partial: true }), /other sellers/);
  });
});

describe('courierLocked', () => {
  it('locks a saved courier once the parcel has shipped', () => {
    assert.equal(courierLocked('shipped', 'India Post'), true);
    assert.equal(courierLocked('delivered', 'India Post'), true);
  });

  it('leaves it open until then', () => {
    for (const status of ['pending', 'confirmed', 'ready_for_dispatch']) assert.equal(courierLocked(status, 'India Post'), false);
  });

  it('still lets a shipped order with no courier get one', () => {
    for (const courier of [null, undefined, '', '  ']) assert.equal(courierLocked('shipped', courier), false);
  });
});

describe('mobileTelHref', () => {
  it('dials with the country code', () => {
    assert.equal(mobileTelHref('9692337616'), 'tel:+919692337616');
    assert.equal(mobileTelHref('+91 96923 37616'), 'tel:+919692337616');
    assert.equal(mobileTelHref('+1 415 555 2671'), 'tel:+14155552671');
  });

  it('offers no call for a missing or unusable number', () => {
    for (const phone of [null, undefined, '', 'null', 'not given', '12345']) assert.equal(mobileTelHref(phone), '');
  });
});
