'use client';

// Add / edit product listing, laid out like the website admin panel. One form, two layouts:
// the desktop dialog (two columns) and the phone sheet (stacked sections). State and saving
// live in SellerProvider.

import React from 'react';
import { ImagePlus, X } from 'lucide-react';
import { IMAGE_SLOTS, SPEC_FIELDS, useSeller } from './app/SellerProvider';

export default function ProductForm({ variant, formId }: { variant: 'desktop' | 'mobile'; formId: string }) {
  const { productForm: f, setProductField: set, setProductSpec, pickProductImage, removeProductImage, saveProduct, closeProductForm } = useSeller();
  if (!f) return null;
  const add = f.draft;
  const editing = f.editingId !== null;
  const err = f.fieldErrors;
  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); void saveProduct(); };
  const describedBy = (k: keyof typeof err) => (err[k] ? `${formId}-${k}-err` : undefined);
  const fieldError = (k: keyof typeof err) => err[k] && <p id={`${formId}-${k}-err`} className={variant === 'mobile' ? 'sx-field-error' : 'loc'} style={variant === 'desktop' ? { color: 'var(--rust)', marginTop: 4 } : undefined}>{err[k]}</p>;

  const images = variant === 'mobile' ? (
    <div className="sx-img-grid">
      {IMAGE_SLOTS.map(([slot, label]) => (
        <div key={slot} className="sx-img-slot-wrap">
          <label className="sx-img-slot">
            {f.images[slot]
              ? <img src={f.images[slot]} alt={label} />
              : <span className="sx-img-ph"><ImagePlus size={20} aria-hidden /><span>Upload</span></span>}
            <span className="sx-img-label">{label}</span>
            <input type="file" accept="image/*" className="sx-visually-hidden" onChange={e => { pickProductImage(slot, e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {f.images[slot] && (
            <button type="button" className="sx-img-remove" onClick={() => removeProductImage(slot)} aria-label={`Remove ${label}`}><X size={14} aria-hidden /></button>
          )}
        </div>
      ))}
    </div>
  ) : (
    <div className="pf-images">
      {IMAGE_SLOTS.map(([slot, label]) => (
        <label key={slot} className="pf-img-slot">
          {f.images[slot]
            ? <img src={f.images[slot]} alt={label} />
            : <span className="pf-img-ph"><ImagePlus size={20} /><span>Upload</span></span>}
          <span className="pf-img-label">{label}</span>
          <input type="file" accept="image/*" hidden onChange={e => { pickProductImage(slot, e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      ))}
    </div>
  );

  if (variant === 'mobile') {
    return (
      <form id={formId} onSubmit={onSubmit} noValidate className="sx-form">
        <section className="sx-form-section">
          <h3>Basics</h3>
          <div className="sx-field">
            <label htmlFor={`${formId}-name`}>Product name{!editing && <span aria-hidden> *</span>}</label>
            <input id={`${formId}-name`} type="text" required autoComplete="off" placeholder="e.g. Calcium Syrup" value={add.name} readOnly={editing}
              aria-invalid={!!err.name} aria-describedby={describedBy('name') ?? (editing ? `${formId}-name-hint` : undefined)} onChange={e => set('name', e.target.value)} />
            {editing && <p id={`${formId}-name-hint`} className="sx-hint">The name identifies this product on the website and can&apos;t be changed here.</p>}
            {fieldError('name')}
          </div>
          {!editing && (
            <div className="sx-field">
              <label htmlFor={`${formId}-slug`}>Web address (slug) <span className="sx-hint-inline">optional</span></label>
              <input id={`${formId}-slug`} type="text" autoComplete="off" autoCapitalize="none" placeholder="calcium-syrup" value={add.slug} onChange={e => set('slug', e.target.value)} />
            </div>
          )}
          <div className="sx-field">
            <label htmlFor={`${formId}-desc`}>Short description</label>
            <textarea id={`${formId}-desc`} rows={2} placeholder="One-line summary shown on product cards." value={add.description} onChange={e => set('description', e.target.value)} />
          </div>
        </section>

        <section className="sx-form-section">
          <h3>Price &amp; stock</h3>
          <div className="sx-field-row">
            <div className="sx-field">
              <label htmlFor={`${formId}-price`}>Price (₹)</label>
              <input id={`${formId}-price`} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="Not set" value={add.price}
                aria-invalid={!!err.price} aria-describedby={describedBy('price')} onChange={e => set('price', e.target.value.replace(/[^\d]/g, ''))} />
              {fieldError('price')}
            </div>
            <div className="sx-field">
              <label htmlFor={`${formId}-stock`}>{editing ? 'Units in stock' : 'Opening stock'}</label>
              <input id={`${formId}-stock`} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={add.stock}
                aria-invalid={!!err.stock} aria-describedby={describedBy('stock')} onChange={e => set('stock', e.target.value.replace(/[^\d]/g, ''))} />
              {fieldError('stock')}
            </div>
          </div>
          <div className="sx-field-row">
            <div className="sx-field">
              <label htmlFor={`${formId}-size`}>Pack size</label>
              <input id={`${formId}-size`} type="text" placeholder="e.g. 500 ml" value={add.size} onChange={e => set('size', e.target.value)} />
            </div>
            <div className="sx-field">
              <label htmlFor={`${formId}-sku`}>SKU <span className="sx-hint-inline">optional</span></label>
              <input id={`${formId}-sku`} type="text" autoCapitalize="characters" value={add.sku} onChange={e => set('sku', e.target.value)} />
            </div>
          </div>
          {add.price.trim() === '' && <p className="sx-hint">Without a price, customers can&apos;t order this product.</p>}
        </section>

        <section className="sx-form-section">
          <h3>Listing</h3>
          <div className="sx-field-row">
            <div className="sx-field">
              <label htmlFor={`${formId}-cat`}>Category</label>
              <select id={`${formId}-cat`} value={add.category} onChange={e => set('category', e.target.value as 'Health' | 'Nutrition')}>
                <option value="Health">Health</option>
                <option value="Nutrition">Nutrition</option>
              </select>
            </div>
            <div className="sx-field">
              <label htmlFor={`${formId}-order`}>Display order</label>
              <input id={`${formId}-order`} type="text" inputMode="numeric" value={add.order} aria-invalid={!!err.order} aria-describedby={describedBy('order') ?? `${formId}-order-hint`} onChange={e => set('order', e.target.value.replace(/[^\d-]/g, ''))} />
              <p id={`${formId}-order-hint`} className="sx-hint">Lower shows first.</p>
              {fieldError('order')}
            </div>
          </div>
          <label className="sx-switch">
            <input type="checkbox" checked={add.active} onChange={e => set('active', e.target.checked)} />
            <span className="sx-switch-track" aria-hidden><span /></span>
            <span><strong>Published</strong><small>Live on the website</small></span>
          </label>
          <label className="sx-switch">
            <input type="checkbox" checked={add.featured} onChange={e => set('featured', e.target.checked)} />
            <span className="sx-switch-track" aria-hidden><span /></span>
            <span><strong>Featured</strong><small>Shown among featured products</small></span>
          </label>
        </section>

        <section className="sx-form-section">
          <h3>Product images</h3>
          <p className="sx-hint">One main image (shown first) and up to three angle views. JPG, PNG or WebP.</p>
          {images}
        </section>

        <details className="sx-form-section sx-form-more">
          <summary><h3>More details</h3><span className="sx-hint-inline">description, highlights, usage…</span></summary>
          <div className="sx-field">
            <label htmlFor={`${formId}-long`}>Full description</label>
            <textarea id={`${formId}-long`} rows={4} placeholder="Shown on the product detail page." value={add.longDescription} onChange={e => set('longDescription', e.target.value)} />
          </div>
          <div className="sx-field">
            <label htmlFor={`${formId}-high`}>Highlights <span className="sx-hint-inline">one per line</span></label>
            <textarea id={`${formId}-high`} rows={3} placeholder={'Boosts immunity\nImproves milk yield'} value={add.highlights} onChange={e => set('highlights', e.target.value)} />
          </div>
          <div className="sx-field">
            <label htmlFor={`${formId}-rec`}>Recommended for <span className="sx-hint-inline">one per line</span></label>
            <textarea id={`${formId}-rec`} rows={2} placeholder={'Goats\nSheep'} value={add.recommendedFor} onChange={e => set('recommendedFor', e.target.value)} />
          </div>
          <fieldset className="sx-field sx-specs">
            <legend>Specifications <span className="sx-hint-inline">only filled rows appear on the website</span></legend>
            {SPEC_FIELDS.map(([label, placeholder], i) => (
              <div key={label} className="sx-spec-row">
                <label htmlFor={`${formId}-spec-${i}`}>{label}</label>
                <input id={`${formId}-spec-${i}`} type="text" placeholder={placeholder} value={f.specs[label] ?? ''} onChange={e => setProductSpec(label, e.target.value)} />
              </div>
            ))}
          </fieldset>
          <div className="sx-field">
            <label htmlFor={`${formId}-use`}>Usage / dosage</label>
            <textarea id={`${formId}-use`} rows={2} value={add.usage} onChange={e => set('usage', e.target.value)} />
          </div>
          <div className="sx-field">
            <label htmlFor={`${formId}-store`}>Storage &amp; handling</label>
            <textarea id={`${formId}-store`} rows={2} value={add.storage} onChange={e => set('storage', e.target.value)} />
          </div>
          <div className="sx-field">
            <label htmlFor={`${formId}-ing`}>Composition / ingredients</label>
            <textarea id={`${formId}-ing`} rows={2} value={add.ingredients} onChange={e => set('ingredients', e.target.value)} />
          </div>
        </details>

        {f.error && <p className="sx-form-error" role="alert">{f.error}</p>}
      </form>
    );
  }

  // Desktop: the original two-column dialog layout.
  return (
    <form onSubmit={onSubmit} className="product-form" id={formId} noValidate>
      <div className="pf-grid">
        <div className="pf-main">
          <section className="pf-section">
            <h3 className="pf-section-title">Basics</h3>
            <div className="form-group">
              <label htmlFor="ap-name">Product name *</label>
              <input id="ap-name" type="text" required placeholder="e.g. Calcium Syrup" value={add.name} readOnly={editing} title={editing ? 'The name identifies this product on the website and cannot be changed here' : undefined} aria-invalid={!!err.name} aria-describedby={describedBy('name')} onChange={e => set('name', e.target.value)} />
              {fieldError('name')}
            </div>
            <div className="form-group">
              <label htmlFor="ap-slug">Slug <span className="pf-hint">leave blank to generate from the name</span></label>
              <input id="ap-slug" type="text" placeholder="calcium-syrup" value={add.slug} readOnly={editing} onChange={e => set('slug', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-desc">Short description</label>
              <textarea id="ap-desc" rows={2} placeholder="One-line summary shown on product cards." value={add.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-long">Full description</label>
              <textarea id="ap-long" rows={4} placeholder="Shown on the product detail page." value={add.longDescription} onChange={e => set('longDescription', e.target.value)} />
            </div>
          </section>

          <section className="pf-section">
            <h3 className="pf-section-title">Highlights &amp; details</h3>
            <div className="form-group">
              <label htmlFor="ap-high">Highlights <span className="pf-hint">one per line</span></label>
              <textarea id="ap-high" rows={3} placeholder={'Boosts immunity\nImproves milk yield'} value={add.highlights} onChange={e => set('highlights', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-rec">Recommended for <span className="pf-hint">one per line</span></label>
              <textarea id="ap-rec" rows={2} placeholder={'Goats\nSheep'} value={add.recommendedFor} onChange={e => set('recommendedFor', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Product specifications <span className="pf-hint">only rows with a value appear on the website</span></label>
              <div className="pf-specs">
                {SPEC_FIELDS.map(([label, placeholder]) => (
                  <div key={label} className="pf-spec-row">
                    <span className="pf-spec-label">{label}</span>
                    <input type="text" placeholder={placeholder} aria-label={label} value={f.specs[label] ?? ''} onChange={e => setProductSpec(label, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="ap-use">Usage / dosage</label>
              <textarea id="ap-use" rows={2} value={add.usage} onChange={e => set('usage', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-store">Storage &amp; handling</label>
              <textarea id="ap-store" rows={2} value={add.storage} onChange={e => set('storage', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-ing">Composition / ingredients</label>
              <textarea id="ap-ing" rows={2} value={add.ingredients} onChange={e => set('ingredients', e.target.value)} />
            </div>
          </section>

          <section className="pf-section">
            <h3 className="pf-section-title">Product images</h3>
            <p className="pf-hint" style={{ display: 'block', marginBottom: 10 }}>One main image (shown first) and up to three angle views. JPG, PNG or WebP.</p>
            {images}
          </section>
        </div>

        <aside className="pf-side">
          <section className="pf-section">
            <h3 className="pf-section-title">Publish</h3>
            <label className="check-filter" style={{ display: 'flex' }}>
              <input type="checkbox" checked={add.active} onChange={e => set('active', e.target.checked)} />
              Published <span className="pf-hint">live on the website</span>
            </label>
            <label className="check-filter" style={{ display: 'flex', marginTop: 8 }}>
              <input type="checkbox" checked={add.featured} onChange={e => set('featured', e.target.checked)} />
              Featured
            </label>
          </section>

          <section className="pf-section">
            <h3 className="pf-section-title">Organisation</h3>
            <div className="form-group">
              <label htmlFor="ap-cat">Category</label>
              <select id="ap-cat" className="filter-select" value={add.category} onChange={e => set('category', e.target.value as 'Health' | 'Nutrition')} style={{ width: '100%' }}>
                <option value="Health">Health</option>
                <option value="Nutrition">Nutrition</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ap-order">Order <span className="pf-hint">lower shows first</span></label>
              <input id="ap-order" type="number" step={1} value={add.order} aria-invalid={!!err.order} aria-describedby={describedBy('order')} onChange={e => set('order', e.target.value)} />
              {fieldError('order')}
            </div>
          </section>

          <section className="pf-section">
            <h3 className="pf-section-title">Pricing &amp; stock</h3>
            <div className="form-group">
              <label htmlFor="ap-price">Price (₹)</label>
              <input id="ap-price" type="number" min={0} step={1} placeholder="Not set" value={add.price} aria-invalid={!!err.price} aria-describedby={describedBy('price')} onChange={e => set('price', e.target.value)} />
              {fieldError('price')}
            </div>
            <div className="form-group">
              <label htmlFor="ap-size">Size / unit</label>
              <input id="ap-size" type="text" placeholder="e.g. 500 ml" value={add.size} onChange={e => set('size', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-sku">SKU / product ID</label>
              <input id="ap-sku" type="text" placeholder="Optional" value={add.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ap-stock">{editing ? 'Stock (units)' : 'Opening stock (units)'}</label>
              <input id="ap-stock" type="number" min={0} step={1} placeholder="0" value={add.stock} aria-invalid={!!err.stock} aria-describedby={describedBy('stock')} onChange={e => set('stock', e.target.value)} />
              {fieldError('stock')}
            </div>
          </section>
        </aside>
      </div>

      {f.error && <p className="loc" role="alert" style={{ color: 'var(--rust)', margin: '4px 0 12px' }}>{f.error}</p>}
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={closeProductForm}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={f.busy}>{f.busy ? (editing ? 'Saving…' : 'Adding…') : (editing ? 'Save changes' : 'Add product')}</button>
      </div>
    </form>
  );
}
