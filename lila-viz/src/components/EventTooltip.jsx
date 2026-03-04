function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function EventTooltip({ event, position, onClose }) {
  if (!event) return null;

  return (
    <div
      className="event-tooltip"
      style={{ left: position.x + 15, top: position.y - 10 }}
    >
      <button className="tooltip-close" onClick={onClose}>&times;</button>
      <div className="tooltip-row">
        <span className="tooltip-label">Event</span>
        <span className="tooltip-value">{event.type}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Player</span>
        <span className="tooltip-value">{event.userId.slice(0, 12)}{event.userId.length > 12 ? '...' : ''}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Type</span>
        <span className="tooltip-value">{event.isBot ? 'Bot' : 'Human'}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Time</span>
        <span className="tooltip-value">{formatTime(event.t)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Elevation</span>
        <span className="tooltip-value">{event.elevation.toFixed(1)}</span>
      </div>
    </div>
  );
}
