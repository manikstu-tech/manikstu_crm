import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Download, ImagePlus, Megaphone, MessageCircle, Search, Send, Users, X } from 'lucide-react';
import { SalesOrder, TODAY } from '../../data/managerDashboard';
import { AUDIENCES, AudienceKey, Campaign, Recipient, TEMPLATES, fillTemplate, whatsappTo } from '../../data/marketing';
import { daysBefore, nowStamp, shortDate } from '../../lib/format';
import { ExportFormat, exportTable } from '../../lib/export';
import { TeamData, callerName, isOpenLead, stageName, stageOf, verticalName } from './tcData';
import CardTable from '../CardTable';

const QUEUE_PAGE = 12;
const CONTACT_PAGE = 10;

interface Props {
  data: TeamData;
  orders: SalesOrder[];
  campaigns: Campaign[];
  onCampaignsChange: (c: Campaign[]) => void;
  onToast: (message: string) => void;
}

interface Contact {
  name: string;
  phone: string;
  /** Last product bought, for buyers; the product line asked about, for leads. */
  product: string;
  place: string;
  detail: string;
  /** Last order, or last time the lead was worked. */
  when: string;
  kind: 'customer' | 'lead';
  /** Where this client came from: they ordered, sent an enquiry, complained, or are a lead. One client can be several. */
  tags: ClientTag[];
  email?: string | null;
}

type ClientTag = 'order' | 'enquiry' | 'complaint' | 'lead';
const TAG_LABEL: Record<ClientTag, string> = { order: 'Customer', enquiry: 'Enquiry', complaint: 'Complaint', lead: 'Lead' };
const TAG_CHIP: Record<ClientTag, string> = { order: 'delivered', enquiry: 'transit', complaint: 'pending', lead: 'confirmed' };
const TAG_PILL: Record<ClientTag, string> = { order: 'Customers', enquiry: 'Enquiries', complaint: 'Complaints', lead: 'Leads' };

/** One client as GET /marketing/clients returns it (the backend merges orders, enquiries, complaints and leads by phone). */
interface RemoteClient {
  phone: string; name: string; place: string | null; email: string | null; product: string | null;
  tags: ClientTag[]; orders: number; detail: string; when: string | null;
}

/** WhatsApp marketing: pick who to reach, write the message, then send it chat by chat. */
export default function TeamMarketing({ data, orders, campaigns, onCampaignsChange, onToast }: Props) {
  // Every client from the CRM backend: website orders (even just placed), enquiries and complaints, plus imported leads.
  // Null until it loads, and for good when there is no backend (the offline demo works from the sample data below).
  const [remote, setRemote] = useState<{ clients: RemoteClient[]; products: string[] } | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const res = await fetch('/api/marketing/clients', { cache: 'no-store' });
        if (res.status === 400) { if (timer) clearInterval(timer); return; } // no backend
        if (!res.ok) return;
        const body = await res.json();
        if (!stop && Array.isArray(body.data)) setRemote({ clients: body.data as RemoteClient[], products: (body.products ?? []) as string[] });
      } catch { /* try again next tick */ }
    };
    load();
    timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10000);
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, []);

  // Audiences, one contact per phone number
  const audiences = useMemo(() => {
    if (remote) {
      const everyone: Contact[] = remote.clients.map(c => ({
        name: c.name, phone: c.phone, product: c.product ?? '', place: c.place ?? '', detail: c.detail, when: c.when ?? '',
        kind: c.tags.includes('order') ? 'customer' : 'lead', tags: c.tags, email: c.email,
      }));
      const buyers = everyone.filter(c => c.tags.includes('order'));
      return { everyone, buyers, repeat: [], lapsed: [], 'open-leads': [], 'lost-leads': [] } as Record<AudienceKey, Contact[]>;
    }
    const byPhone = new Map<string, { name: string; count: number; last: string; product: string; city: string }>();
    orders.filter(o => o.status !== 'cancelled').forEach(o => {
      const c = byPhone.get(o.phone);
      if (!c) byPhone.set(o.phone, { name: o.customer_name, count: 1, last: o.created_at, product: o.items[0].product_name, city: o.city });
      else { c.count++; if (o.created_at > c.last) { c.last = o.created_at; c.product = o.items[0].product_name; c.city = o.city; } }
    });
    const buyers = Array.from(byPhone, ([phone, c]) => ({ phone, ...c }));
    const leadList = (test: (l: typeof data.leads[number]) => boolean): Contact[] => {
      const seen = new Set<string>();
      return data.leads.filter(test).filter(l => !seen.has(l.phone) && seen.add(l.phone)).map(l => ({
        name: l.customer_name, phone: l.phone, product: verticalName(l.vertical_id), place: l.source,
        detail: `${stageName(l.stage_id)} · ${callerName(l.assigned_to)}`, when: l.updated_at, kind: 'lead' as const, tags: ['lead'] as ClientTag[],
      }));
    };
    const toContact = (b: typeof buyers[number]): Contact => ({
      name: b.name, phone: b.phone, product: b.product, place: b.city,
      detail: `${b.count} order${b.count === 1 ? '' : 's'}`, when: b.last, kind: 'customer', tags: ['order'] as ClientTag[],
    });
    const customers = buyers.map(toContact);
    const buyerPhones = new Set(customers.map(c => c.phone));
    const everyone = [...customers, ...leadList(() => true).filter(c => !buyerPhones.has(c.phone))];
    return {
      everyone,
      buyers: customers,
      repeat: buyers.filter(b => b.count >= 2).map(toContact),
      lapsed: buyers.filter(b => daysBefore(b.last) >= 30).map(toContact),
      'open-leads': leadList(isOpenLead),
      'lost-leads': leadList(l => stageOf(l.stage_id)?.name === 'Lost'),
    } as Record<AudienceKey, Contact[]>;
  }, [remote, orders, data.leads]);

  const reachable = audiences.everyone.length;
  // What a campaign can be about: the live catalogue from the backend, or (offline) whatever the sample orders contain.
  const products = useMemo(() => remote ? remote.products : Array.from(new Set(orders.flatMap(o => o.items.map(i => i.product_name)))).sort(), [remote, orders]);

  // Composer
  // Every campaign goes to everyone with a phone number (the audience picker was removed from the form).
  const [audience] = useState<AudienceKey>('everyone');
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [product, setProduct] = useState(products[0] ?? '');
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [name, setName] = useState('');
  // Optional photo the head picks from their device. Sent with the message by attaching
  // it in the WhatsApp Business broadcast (it downloads with the list).
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { onToast('Please choose an image file (JPG or PNG)'); return; }
    if (file.size > 5 * 1024 * 1024) { onToast('Image is too large — please pick one under 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setPhoto(String(reader.result)); setPhotoName(file.name); };
    reader.readAsDataURL(file);
  };
  const clearPhoto = () => { setPhoto(null); setPhotoName(''); };
  const pickTemplate = (key: string) => { setTemplateKey(key); setMessage(TEMPLATES.find(t => t.key === key)!.text); };
  const contacts = audiences[audience];
  const [contactQuery, setContactQuery] = useState('');
  const [contactPage, setContactPage] = useState(0);
  const cq = contactQuery.trim().toLowerCase();
  const [kind, setKind] = useState<'all' | ClientTag>('all');
  const shownContacts = audiences.everyone
    .filter(c => kind === 'all' || c.tags.includes(kind))
    .filter(c => !cq || [c.name, c.phone].some(v => v.toLowerCase().includes(cq)))
    .sort((a, b) => b.when.localeCompare(a.when) || a.name.localeCompare(b.name)); // newest first: a client who just arrived is on page one
  const contactPages = Math.max(1, Math.ceil(shownContacts.length / CONTACT_PAGE));
  const safeContactPage = Math.min(contactPage, contactPages - 1);
  const previewName = contacts[0]?.name ?? 'Ramesh Nayak';
  const defaultName = `${TEMPLATES.find(t => t.key === templateKey)!.label} · ${product}`;

  // Send queue
  const [openId, setOpenId] = useState<number | null>(null);
  const [queuePage, setQueuePage] = useState(0);
  const open = campaigns.find(c => c.id === openId && !c.sample) ?? null;

  const createCampaign = () => {
    if (contacts.length === 0) { onToast('Nobody in this audience yet'); return; }
    if (!message.trim()) { onToast('Write a message first'); return; }
    const id = Math.max(0, ...campaigns.map(c => c.id)) + 1;
    const recipients: Recipient[] = contacts.map(c => ({ name: c.name, phone: c.phone, text: fillTemplate(message, c.name, product), sent: false }));
    onCampaignsChange([{ id, name: name.trim() || defaultName, audience, templateKey, product, created_at: nowStamp(), recipients, photo: photo ?? undefined, photoName: photoName || undefined }, ...campaigns]);
    setOpenId(id);
    setQueuePage(0);
    setName('');
    clearPhoto();
    onToast(`Campaign ready: ${recipients.length} messages to send${photo ? ' (photo included in the download)' : ''}`);
  };

  const markSent = (campaignId: number, phone: string) => {
    onCampaignsChange(campaigns.map(c => (c.id === campaignId ? { ...c, recipients: c.recipients.map(r => (r.phone === phone ? { ...r, sent: true } : r)) } : c)));
  };

  const exportList = async (c: Campaign, format: ExportFormat) => {
    try {
      const base = `whatsapp-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${TODAY}`;
      await exportTable(format, {
        filename: base,
        title: `WhatsApp campaign · ${c.name}`,
        subtitle: `${c.recipients.length} contacts · ${AUDIENCES.find(a => a.key === c.audience)!.label}`,
        columns: [{ header: 'Name', width: 20 }, { header: 'Phone', width: 13 }, { header: 'Message', width: 60 }, { header: 'Sent', width: 7 }],
        rows: c.recipients.map(r => [r.name, r.phone, r.text, r.sent ? 'Yes' : 'No']),
      });
      // Also download the photo, so the head attaches it in the broadcast (wa.me can't carry it).
      if (c.photo) {
        const ext = (c.photo.match(/^data:image\/(png|jpe?g|webp)/)?.[1] ?? 'jpg').replace('jpeg', 'jpg');
        const a = document.createElement('a');
        a.href = c.photo;
        a.download = c.photoName || `${base}-photo.${ext}`;
        a.click();
      }
      onToast(c.photo
        ? 'List + photo downloaded: start a WhatsApp Business broadcast, add the list, and attach the photo'
        : 'Contact list downloaded: import it into a WhatsApp Business broadcast list');
    } catch {
      onToast('Download failed. Please try again.');
    }
  };

  // Tiles
  const month = TODAY.slice(0, 7);
  const thisMonth = campaigns.filter(c => c.created_at.startsWith(month));
  const sentOf = (c: Campaign) => c.sample ? c.sample.sent : c.recipients.filter(r => r.sent).length;
  const sentMonth = thisMonth.reduce((a, c) => a + sentOf(c), 0);
  const sampled = campaigns.filter(c => c.sample);
  const replyRate = Math.round((sampled.reduce((a, c) => a + c.sample!.replies, 0) / Math.max(1, sampled.reduce((a, c) => a + c.sample!.sent, 0))) * 100);

  const TILES = [
    { icon: Users, n: reachable, label: 'Contacts on WhatsApp' },
    { icon: Megaphone, n: thisMonth.length, label: 'Campaigns this month' },
    { icon: Send, n: sentMonth, label: 'Messages sent this month' },
    { icon: MessageCircle, n: `${replyRate}%`, label: 'Reply rate · past campaigns' },
  ];

  const queueRows = open ? open.recipients.slice(queuePage * QUEUE_PAGE, (queuePage + 1) * QUEUE_PAGE) : [];
  const queuePages = open ? Math.max(1, Math.ceil(open.recipients.length / QUEUE_PAGE)) : 1;
  const openSent = open ? open.recipients.filter(r => r.sent).length : 0;

  return (
    <>
      <div className="fu-tiles">
        {TILES.map(({ icon: Icon, n, label }) => (
          <div key={label} className="stat-tile">
            <Icon className="stat-icon" size={22} />
            <div className="num">{n}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      {/* Composer + preview */}
      <div className="mk-compose">
        <div className="panel mk-form">
          <div className="panel-head"><h2>New WhatsApp campaign</h2><span className="panel-meta">2 steps</span></div>

          <div className="mk-step"><span className="mk-step-n">1</span> What should it say?</div>
          <div className="lf-pills mk-templates">
            {TEMPLATES.map(t => (
              <button key={t.key} className={`lf-pill ${templateKey === t.key ? 'on' : ''}`} onClick={() => pickTemplate(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="mk-fields">
            <label className="form-group">
              <span>Product</span>
              <select className="filter-select" value={product} onChange={e => setProduct(e.target.value)}>
                {products.map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="form-group">
              <span>Campaign name</span>
              <input className="filter-input" value={name} placeholder={defaultName} onChange={e => setName(e.target.value)} />
            </label>
          </div>
          <label className="form-group mk-message">
            <span>Message · {'{name}'} and {'{product}'} are filled in for each person</span>
            <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} />
          </label>

          <div className="form-group mk-photo">
            <span>Photo (optional) · pick one from your device; it downloads with the list to attach in the broadcast</span>
            {photo ? (
              <div className="mk-photo-chosen">
                <img src={photo} alt="Campaign" className="mk-photo-thumb" />
                <div className="mk-photo-meta">
                  <div className="loc">{photoName || 'Selected image'}</div>
                  <div className="mk-photo-actions">
                    <label className="link-btn">
                      Change
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    <button type="button" className="link-btn" onClick={clearPhoto}>Remove</button>
                  </div>
                </div>
              </div>
            ) : (
              <label className="mk-photo-drop">
                <span className="mk-photo-drop-icon"><ImagePlus size={20} /></span>
                <span className="mk-photo-drop-text">
                  <strong>Choose a photo</strong>
                  <small>JPG or PNG from your device · shown with the message</small>
                </span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>

          <div className="mk-step mk-step-last"><span className="mk-step-n">2</span> Send</div>
          <div className="mk-send-row">
            <button className="btn-primary" onClick={createCampaign}><Send size={15} /> Prepare {contacts.length} messages</button>
            <span className="loc">You then send each one on WhatsApp with one tap, or download the list for a WhatsApp Business broadcast.</span>
          </div>
        </div>

        <div className="stack mk-side">
        <div className="panel mk-preview-panel">
          <div className="panel-head"><h2>Preview</h2><span className="panel-meta">as {previewName.split(' ')[0]} sees it</span></div>
          <div className="mk-phone">
            <div className="mk-phone-top"><span className="avatar">M</span><div><strong>Manikstu</strong><div>online</div></div></div>
            <div className="mk-chat">
              <div className="mk-bubble">
                {photo && <img src={photo} alt="Campaign" className="mk-bubble-photo" />}
                {fillTemplate(message || ' ', previewName, product)}
                <span className="mk-time">10:30 <CheckCheck size={13} /></span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel mk-campaigns">
          <div className="panel-head"><h2>Campaigns</h2><span className="panel-meta">{campaigns.length} so far</span></div>
          <ul className="mk-c-list">
            {campaigns.map(c => {
              const total = c.sample ? c.sample.sent : c.recipients.length;
              const sent = sentOf(c);
              return (
                <li key={c.id}>
                  <div className="mk-c-top">
                    <strong>{c.name}</strong>
                    <span className="loc">{shortDate(c.created_at)}</span>
                  </div>
                  <div className="loc">{AUDIENCES.find(a => a.key === c.audience)?.label} · {TEMPLATES.find(t => t.key === c.templateKey)?.label}</div>
                  <div className="mk-c-stats">
                    <span><b>{c.sample ? sent : `${sent}/${total}`}</b> sent</span>
                    <span><b>{c.sample ? c.sample.replies : '—'}</b> replies</span>
                    <span><b>{c.sample ? c.sample.orders : '—'}</b> orders</span>
                    {!c.sample && (
                      <button className="link-btn mk-c-open" onClick={() => { setOpenId(c.id); setQueuePage(0); }}>{sent < total ? 'Continue' : 'View'}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        </div>
      </div>

      {/* Send queue for the campaign being sent */}
      {open && (
        <div className="panel mk-queue">
          <div className="panel-head">
            <h2>Sending · {open.name}</h2>
            <div className="mk-queue-tools">
              <button className="btn-secondary btn-small" onClick={() => exportList(open, 'excel')}><Download size={14} /> Contact list</button>
              <button className="modal-close" onClick={() => setOpenId(null)} aria-label="Close"><X size={18} /></button>
            </div>
          </div>
          <div className="mk-progress">
            <div className="exec-load-bar"><span style={{ width: `${(openSent / Math.max(1, open.recipients.length)) * 100}%` }} /></div>
            <span><strong>{openSent}</strong> of {open.recipients.length} sent</span>
          </div>
          <ul className="mk-recipients">
            {queueRows.map(r => (
              <li key={r.phone} className={r.sent ? 'sent' : undefined}>
                <div className="mk-r-who"><strong>{r.name}</strong><span className="loc">{r.phone}</span></div>
                <div className="mk-r-text">{r.text}</div>
                {r.sent
                  ? <span className="chip delivered"><CheckCheck size={12} /> Sent</span>
                  : (
                    <a className="ord-wa" href={whatsappTo(r.phone, r.text)} target="_blank" rel="noreferrer" onClick={() => markSent(open.id, r.phone)}>
                      <MessageCircle size={14} /> Send
                    </a>
                  )}
              </li>
            ))}
          </ul>
          {queuePages > 1 && (
            <div className="pager">
              <span className="loc">Page {queuePage + 1} of {queuePages}</span>
              <div className="pager-btns">
                <button className="btn-secondary btn-small" disabled={queuePage === 0} onClick={() => setQueuePage(queuePage - 1)}>Previous</button>
                <button className="btn-secondary btn-small" disabled={queuePage >= queuePages - 1} onClick={() => setQueuePage(queuePage + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Every client: whoever ordered, enquired or complained on the website, plus imported leads (one row per phone number) */}
      <div className="panel">
        <div className="panel-head mk-contacts-head">
          <h2>All clients</h2>
          <div className="mk-contacts-tools">
            <div className="lf-pills">
              <button className={`lf-pill ${kind === 'all' ? 'on' : ''}`} onClick={() => { setKind('all'); setContactPage(0); }}>All · {audiences.everyone.length}</button>
              {(['order', 'enquiry', 'complaint', 'lead'] as ClientTag[]).map(k => (
                <button key={k} className={`lf-pill ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); setContactPage(0); }}>
                  {TAG_PILL[k]} · {audiences.everyone.filter(c => c.tags.includes(k)).length}
                </button>
              ))}
            </div>
            <div className="search mk-contacts-search">
              <Search size={15} style={{ color: 'var(--ink-soft)' }} />
              <input value={contactQuery} placeholder="Search name or phone…" onChange={e => { setContactQuery(e.target.value); setContactPage(0); }} />
            </div>
          </div>
        </div>
        <CardTable>
          <table className="orders-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Came from</th><th>Latest</th><th className="num-col">Send</th></tr>
            </thead>
            <tbody>
              {shownContacts.length === 0 && <tr><td colSpan={5} className="loc" style={{ textAlign: 'center', padding: 24 }}>Nobody{cq ? ' matches that search' : ' here yet'}.</td></tr>}
              {shownContacts.slice(safeContactPage * CONTACT_PAGE, (safeContactPage + 1) * CONTACT_PAGE).map(c => (
                <tr key={c.phone}>
                  <td className="cust">{c.name}{(c.place || c.email) && <div className="loc">{[c.place, c.email].filter(Boolean).join(' · ')}</div>}</td>
                  <td>{c.phone}</td>
                  <td>
                    {c.tags.map(t => <span key={t} className={`chip ${TAG_CHIP[t]}`} style={{ marginRight: 4 }}>{TAG_LABEL[t]}</span>)}
                    {c.tags.length > 1 && <div className="loc">{c.detail}</div>}
                  </td>
                  <td>{c.when ? shortDate(c.when) : '—'}{c.product && <div className="loc">{c.product}</div>}</td>
                  <td className="num-col">
                    <a className="ord-wa" href={whatsappTo(c.phone, fillTemplate(message, c.name, product))} target="_blank" rel="noreferrer" title="Send the campaign message to just this person">
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardTable>
        {contactPages > 1 && (
          <div className="pager">
            <span className="loc">Page {safeContactPage + 1} of {contactPages}</span>
            <div className="pager-btns">
              <button className="btn-secondary btn-small" disabled={safeContactPage === 0} onClick={() => setContactPage(safeContactPage - 1)}>Previous</button>
              <button className="btn-secondary btn-small" disabled={safeContactPage >= contactPages - 1} onClick={() => setContactPage(safeContactPage + 1)}>Next</button>
            </div>
          </div>
        )}
        <div className="panel-note">
          Past campaigns and their replies and orders are sample data. Messages go out one chat at a time through WhatsApp on this device; sending to everyone at once, and counting replies, needs the WhatsApp Business API connected to the backend.
        </div>
      </div>
    </>
  );
}
