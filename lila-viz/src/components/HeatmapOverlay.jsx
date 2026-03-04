export default function HeatmapOverlay({ activeHeatmap, onToggle, showTrails, onToggleTrails }) {
  const types = [
    { key: 'traffic', label: 'Traffic' },
    { key: 'kills', label: 'Kills' },
    { key: 'deaths', label: 'Deaths' },
    { key: 'loot', label: 'Loot' },
    { key: 'storm_deaths', label: 'Storm Deaths' },
  ];

  return (
    <div className="heatmap-controls">
      <label className="toggle-label trail-toggle">
        <input type="checkbox" checked={showTrails} onChange={onToggleTrails} />
        <span>Trails</span>
      </label>
      <span className="heatmap-divider">|</span>
      <span className="heatmap-label">Heatmap:</span>
      {types.map(t => (
        <button
          key={t.key}
          className={`btn btn-sm ${activeHeatmap === t.key ? 'btn-active' : ''}`}
          onClick={() => onToggle(activeHeatmap === t.key ? null : t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
