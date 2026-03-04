import { useMemo } from 'react';
import { EVENT_STYLES } from '../utils/colors';

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Try to find victim for kill events by matching timestamp + proximity
function findVictim(evt, allPlayers, ownerUserId) {
  if (evt.type !== 'Kill' && evt.type !== 'BotKill') return null;

  const victimType = evt.type === 'Kill' ? 'Killed' : 'BotKilled';
  let best = null;
  let bestDist = 50;

  for (const p of allPlayers) {
    if (p.user_id === ownerUserId) continue;
    for (const e of p.events) {
      if (e.type !== victimType) continue;
      if (Math.abs(e.t - evt.t) > 1.0) continue;
      const dx = e.px - evt.px;
      const dy = e.py - evt.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = p.user_id;
      }
    }
  }
  return best;
}

export default function EventList({
  player, allPlayers, hoveredEventIdx, onHoverEvent, onLeaveEvent,
  enabledEventTypes,
}) {
  if (!player) return null;

  // Filter to non-position events that are enabled
  const events = useMemo(() => {
    return player.events
      .map((e, idx) => ({ ...e, _idx: idx }))
      .filter(e => e.type !== 'Position' && e.type !== 'BotPosition')
      .filter(e => enabledEventTypes.has(e.type));
  }, [player, enabledEventTypes]);

  if (events.length === 0) {
    return (
      <div className="event-list">
        <h3>Events</h3>
        <p className="hint" style={{ padding: '8px 16px' }}>No events match current filters</p>
      </div>
    );
  }

  return (
    <div className="event-list">
      <h3>Events ({events.length})</h3>
      <div className="event-list-scroll">
        {events.map((evt, i) => {
          const style = EVENT_STYLES[evt.type];
          const victim = (evt.type === 'Kill' || evt.type === 'BotKill')
            ? findVictim(evt, allPlayers, player.user_id)
            : null;
          const isHovered = hoveredEventIdx === evt._idx;

          return (
            <div
              key={i}
              className={`event-item ${isHovered ? 'event-item-hovered' : ''}`}
              onMouseEnter={() => onHoverEvent(evt._idx)}
              onMouseLeave={onLeaveEvent}
            >
              <span
                className="event-dot"
                style={{ backgroundColor: style?.color || '#888' }}
              />
              <div className="event-item-info">
                <span className="event-item-type">
                  {style?.label || evt.type}
                  {victim && (
                    <span className="event-victim"> → {victim}</span>
                  )}
                </span>
                <span className="event-item-meta">
                  {formatTime(evt.t)} · ({Math.round(evt.px)}, {Math.round(evt.py)})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
