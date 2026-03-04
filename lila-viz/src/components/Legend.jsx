import { EVENT_STYLES, PLAYER_COLORS, BOT_COLOR } from '../utils/colors';

const legendItems = Object.entries(EVENT_STYLES).map(([key, val]) => ({
  key,
  label: val.label,
  shape: val.shape,
  color: val.color,
}));

function ShapeIcon({ shape, color }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      {/* Black background for contrast */}
      <rect x="0" y="0" width="18" height="18" rx="3" fill="rgba(0,0,0,0.4)" />
      {shape === 'crosshair' && (
        <g stroke={color} strokeWidth="3">
          <line x1="9" y1="3" x2="9" y2="15" />
          <line x1="3" y1="9" x2="15" y2="9" />
        </g>
      )}
      {shape === 'x' && (
        <g stroke={color} strokeWidth="3">
          <line x1="4" y1="4" x2="14" y2="14" />
          <line x1="14" y1="4" x2="4" y2="14" />
        </g>
      )}
      {shape === 'diamond' && (
        <polygon points="9,2 16,9 9,16 2,9" fill={color} />
      )}
      {shape === 'square' && (
        <rect x="3" y="3" width="12" height="12" fill={color} />
      )}
    </svg>
  );
}

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Legend</div>
      {legendItems.map(item => (
        <div key={item.key} className="legend-item">
          <ShapeIcon shape={item.shape} color={item.color} />
          <span>{item.label}</span>
        </div>
      ))}
      <div className="legend-divider" />
      <div className="legend-item">
        <svg width={24} height={4} style={{ flexShrink: 0 }}>
          <line x1="0" y1="2" x2="24" y2="2" stroke={PLAYER_COLORS[0]} strokeWidth="3" />
        </svg>
        <span>Human trail</span>
      </div>
      <div className="legend-item">
        <svg width={24} height={4} style={{ flexShrink: 0 }}>
          <line x1="0" y1="2" x2="24" y2="2" stroke={BOT_COLOR} strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        <span>Bot trail</span>
      </div>
      <div className="legend-divider" />
      <div className="legend-shortcuts">
        <div><kbd>R</kbd> Reset zoom</div>
        <div><kbd>Esc</kbd> Deselect</div>
      </div>
    </div>
  );
}
