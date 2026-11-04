import React from 'react';
import { formatDeliveryAddress, formatMobile } from '../../lib/orderDisplay';

interface Props {
  order: { customer_name?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null };
}

/** Who the order goes to, in the Tracking details window: name, complete address and the customer's mobile. */
export default function DeliveryDetails({ order }: Props) {
  const name = order.customer_name?.trim();
  const address = formatDeliveryAddress(order);
  const mobile = formatMobile(order.phone);
  return (
    <dl className="od-delivery">
      <dt>Customer name</dt>
      <dd className={name ? 'strong' : 'loc'}>{name || 'Not available'}</dd>
      <dt>Complete address</dt>
      <dd className={address ? undefined : 'loc'}>{address || 'Not available'}</dd>
      <dt>Mobile number</dt>
      <dd className={mobile ? undefined : 'loc'}>{mobile || 'Not available'}</dd>
    </dl>
  );
}
