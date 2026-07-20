export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading GridFlow workspace">
      <div className="route-loading-bar" />
      <div className="route-loading-grid">
        <span /><span /><span /><span />
      </div>
      <div className="route-loading-panel"><span /><span /><span /><span /><span /></div>
      <span className="sr-only">Loading GridFlow…</span>
    </div>
  );
}
