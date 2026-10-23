// Shown while the seller's orders and products load from the CRM.
export default function SellerLoading() {
  return (
    <div className="sx sx-app" aria-busy="true" aria-live="polite">
      <span className="sx-visually-hidden">Loading your seller dashboard…</span>
      <div className="sx-skel-page" aria-hidden>
        <div className="sx-skel" style={{ height: 44, width: '55%' }} />
        <div className="sx-skel" style={{ height: 150, borderRadius: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div className="sx-skel" style={{ height: 96 }} />
          <div className="sx-skel" style={{ height: 96 }} />
          <div className="sx-skel" style={{ height: 96 }} />
        </div>
        <div className="sx-skel" style={{ height: 220 }} />
        <div className="sx-skel" style={{ height: 180 }} />
      </div>
      <div className="sx-skel-nav" aria-hidden />
    </div>
  );
}
