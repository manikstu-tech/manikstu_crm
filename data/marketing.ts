// WhatsApp marketing: audiences, message templates and campaigns sent by the telecalling head.
// Not in the backend yet: campaigns live in the dashboard for this session, and messages go out
// one chat at a time through WhatsApp on this device (bulk sending needs the WhatsApp Business API).

export type AudienceKey = 'everyone' | 'buyers' | 'repeat' | 'lapsed' | 'open-leads' | 'lost-leads';

export const AUDIENCES: { key: AudienceKey; label: string; hint: string }[] = [
  { key: 'everyone', label: 'Everyone', hint: 'All customers and farmers' },
  { key: 'buyers', label: 'All customers', hint: 'Everyone who has ordered' },
  { key: 'repeat', label: 'Repeat buyers', hint: 'Ordered 2 or more times' },
  { key: 'lapsed', label: 'Due for reorder', hint: 'Last order 30+ days ago' },
  { key: 'open-leads', label: 'Open leads', hint: 'Interested, not bought yet' },
  { key: 'lost-leads', label: 'Lost leads', hint: 'Said no: win them back' },
];

export interface MessageTemplate {
  key: string;
  label: string;
  /** {name} = first name, {product} = the chosen product. */
  text: string;
}

export const TEMPLATES: MessageTemplate[] = [
  {
    key: 'reorder',
    label: 'Reorder reminder',
    text: 'Namaskar {name} 🙏 Time to restock {product} for your animals? Reply YES and we will deliver to your village. Cash on delivery available. – Manikstu',
  },
  {
    key: 'offer',
    label: 'Festival offer',
    text: 'Namaskar {name} 🙏 Festive offer from Manikstu: 10% off {product} this week. Reply YES to order, or call us to know more.',
  },
  {
    key: 'new',
    label: 'New product',
    text: 'Namaskar {name} 🙏 New from Manikstu: {product}, made for healthier, more productive livestock. Reply INFO for details and price.',
  },
  {
    key: 'nudge',
    label: 'Lead follow-up',
    text: 'Namaskar {name} 🙏 You had asked about {product}. Shall we send it to you? Reply YES, or tell us a good time to call. – Manikstu',
  },
];

export interface Recipient {
  name: string;
  phone: string;
  text: string;
  sent: boolean;
}

export interface Campaign {
  id: number;
  name: string;
  audience: AudienceKey;
  templateKey: string;
  product: string;
  created_at: string;
  recipients: Recipient[];
  /** Optional photo to send with the message (a data URL). Downloaded with the list so
   * the head attaches it in the WhatsApp Business broadcast (wa.me links can't carry it). */
  photo?: string;
  photoName?: string;
  /** Sample history only: counts from before this dashboard tracked recipients. */
  sample?: { sent: number; replies: number; orders: number };
}

export const SAMPLE_CAMPAIGNS: Campaign[] = [
  { id: 3, name: 'Monsoon reorder: Protein Block', audience: 'lapsed', templateKey: 'reorder', product: 'Protein Block', created_at: '2026-09-18T10:30', recipients: [], sample: { sent: 64, replies: 19, orders: 7 } },
  { id: 2, name: 'Nuakhai offer', audience: 'buyers', templateKey: 'offer', product: 'Multi Mineral Lick Block', created_at: '2026-09-05T09:15', recipients: [], sample: { sent: 212, replies: 41, orders: 18 } },
  { id: 1, name: 'Hydracharge launch', audience: 'open-leads', templateKey: 'new', product: 'Hydracharge', created_at: '2026-08-22T11:00', recipients: [], sample: { sent: 138, replies: 22, orders: 6 } },
];

export const fillTemplate = (text: string, name: string, product: string) =>
  text.replace(/\{name\}/g, name.split(' ')[0]).replace(/\{product\}/g, product);

/** WhatsApp chat with this number, the message already typed in. */
export const whatsappTo = (phone: string, text: string) =>
  `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
