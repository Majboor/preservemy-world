export function LandscapeGuard() {
  return (
    <div className="landscape-guard" aria-live="polite">
      <div className="landscape-guard__panel ui-panel">
        <div className="landscape-guard__phone" aria-hidden="true">
          <i />
        </div>
        <strong>Turn phone sideways</strong>
        <p>Landscape unlocks flight controls, the map, and Studio builder panels. Rotate, then keep the device wide.</p>
      </div>
    </div>
  );
}
