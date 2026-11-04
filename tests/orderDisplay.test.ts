import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDeliveryAddress, formatMobile, orderSourceLabel } from '../lib/orderDisplay';

describe('orderSourceLabel', () => {
  it('says Website for a website order', () => {
    assert.equal(orderSourceLabel({ source: 'website', caller_name: null }), 'Website');
  });

  it('names the telecaller who took the order', () => {
    assert.equal(orderSourceLabel({ source: 'telecaller', caller_name: 'Rahul Sharma' }), 'Telecaller – Rahul Sharma');
    assert.equal(orderSourceLabel({ source: 'telecaller', caller_name: 'Ananya Mishra' }), 'Telecaller – Ananya Mishra');
  });

  it('falls back to Telecaller when the name is gone', () => {
    for (const caller_name of [null, undefined, '', '   ', 'null', 'undefined']) {
      assert.equal(orderSourceLabel({ source: 'telecaller', caller_name }), 'Telecaller');
    }
  });

  it('does not put a telecaller on a website order', () => {
    assert.equal(orderSourceLabel({ source: 'website', caller_name: 'Rahul Sharma' }), 'Website');
  });

  it('copes with a missing or unknown source', () => {
    assert.equal(orderSourceLabel({}), 'Source not recorded');
    assert.equal(orderSourceLabel({ source: null }), 'Source not recorded');
    assert.equal(orderSourceLabel({ source: 'fax' }), 'Source not recorded');
    assert.equal(orderSourceLabel({ source: null, caller_name: 'Rahul Sharma' }), 'Telecaller – Rahul Sharma');
  });

  it('ignores the case and spacing of a stored source', () => {
    assert.equal(orderSourceLabel({ source: ' Website ' }), 'Website');
    assert.equal(orderSourceLabel({ source: 'TELECALLER', caller_name: '  Rahul   Sharma ' }), 'Telecaller – Rahul Sharma');
  });
});

describe('formatDeliveryAddress', () => {
  const full = { address: 'Plot 3, Multi Product Test Road, Near test market', city: 'Bhubaneswar', state: 'Odisha', pincode: '751001' };

  it('lists every part with the district from the PIN code', () => {
    assert.equal(formatDeliveryAddress(full), 'Plot 3, Multi Product Test Road, Near test market, Bhubaneswar, Khordha, Odisha – 751001');
  });

  it('leaves out each missing part', () => {
    assert.equal(formatDeliveryAddress({ ...full, address: null }), 'Bhubaneswar, Khordha, Odisha – 751001');
    assert.equal(formatDeliveryAddress({ ...full, pincode: null }), 'Plot 3, Multi Product Test Road, Near test market, Bhubaneswar, Khordha, Odisha');
    assert.equal(formatDeliveryAddress({ address: 'Plot 3', city: null, state: null, pincode: null }), 'Plot 3');
    assert.equal(formatDeliveryAddress({ pincode: '999999' }), '999999');
  });

  it('is empty when there is nothing', () => {
    assert.equal(formatDeliveryAddress({}), '');
    assert.equal(formatDeliveryAddress({ address: null, city: null, state: null, pincode: null }), '');
    assert.equal(formatDeliveryAddress({ address: ' , , ', city: '', state: 'null', pincode: 'undefined' }), '');
  });

  it('never prints null, undefined or stray commas', () => {
    const line = formatDeliveryAddress({ address: 'Plot 3,, ,Road,', city: 'undefined', state: 'null', pincode: '' });
    assert.equal(line, 'Plot 3, Road');
  });

  it('does not repeat what was already typed into the address', () => {
    assert.equal(
      formatDeliveryAddress({ address: 'Plot 3, Bhubaneswar, Odisha 751001', city: 'bhubaneswar', state: 'Odisha', pincode: '751001' }),
      'Plot 3, Bhubaneswar, Odisha, Khordha – 751001',
    );
  });

  it('does not repeat the town when it is also the district', () => {
    assert.equal(formatDeliveryAddress({ address: 'Plot 4', city: 'Pune', state: 'Maharashtra', pincode: '411001' }), 'Plot 4, Pune, Maharashtra – 411001');
  });

  it('keeps a long address whole', () => {
    const address = Array.from({ length: 12 }, (_, i) => `Long locality name ${i}`).join(', ');
    assert.ok(formatDeliveryAddress({ address, city: 'Puri', state: 'Odisha', pincode: '752001' }).startsWith(address));
  });
});

describe('formatMobile', () => {
  it('adds the country code to a 10-digit number', () => {
    assert.equal(formatMobile('9876501234'), '+91 9876501234');
  });

  it('keeps a country code that is already there', () => {
    assert.equal(formatMobile('+919876501234'), '+91 9876501234');
    assert.equal(formatMobile('+91 98765 01234'), '+91 9876501234');
    assert.equal(formatMobile('919876501234'), '+91 9876501234');
    assert.equal(formatMobile('+1 415 555 2671'), '+1 415 555 2671');
  });

  it('drops a leading trunk zero', () => {
    assert.equal(formatMobile('09876501234'), '+91 9876501234');
  });

  it('is empty for a missing number', () => {
    for (const phone of [null, undefined, '', '   ', 'null']) assert.equal(formatMobile(phone), '');
  });

  it('shows an unusual number as stored rather than guessing', () => {
    assert.equal(formatMobile('12345'), '12345');
  });
});
