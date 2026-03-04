import { useState, useRef, useEffect, useMemo } from 'react';
import { EVENT_STYLES } from '../utils/colors';

const MAPS = ['AmbroseValley', 'GrandRift', 'Lockdown'];
const MAP_LABELS = {
  AmbroseValley: 'Ambrose Valley',
  GrandRift: 'Grand Rift',
  Lockdown: 'Lockdown',
};
const DATES = [
  { key: '2026-02-10', label: 'Feb 10' },
  { key: '2026-02-11', label: 'Feb 11' },
  { key: '2026-02-12', label: 'Feb 12' },
  { key: '2026-02-13', label: 'Feb 13' },
  { key: '2026-02-14', label: 'Feb 14', partial: true },
];

const EVENT_TYPE_LIST = ['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot'];

const FILTER_EVENTS = [
  { key: 'kill_count', label: 'Kills' },
  { key: 'death_count', label: 'Deaths' },
  { key: 'storm_death_count', label: 'Storm Deaths' },
  { key: 'loot_count', label: 'Loot' },
  { key: 'player_count', label: 'Players' },
  { key: 'bot_count', label: 'Bots' },
];

const OPERATORS = [
  { key: '>=', label: '>=' },
  { key: '<=', label: '<=' },
  { key: '>', label: '>' },
  { key: '<', label: '<' },
  { key: '==', label: '==' },
];

// Custom searchable dropdown
function SearchableSelect({ value, onChange, options, placeholder, allLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedLabel = value
    ? options.find(o => o.value === value)?.label || value
    : allLabel;

  return (
    <div className="searchable-select" ref={wrapRef}>
      <button
        className="filter-select searchable-trigger"
        onClick={() => { setOpen(!open); setSearch(''); }}
        title={selectedLabel}
      >
        <span className="searchable-text">{selectedLabel}</span>
        <span className="searchable-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="searchable-dropdown">
          <input
            className="searchable-input"
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="searchable-options">
            <div
              className={`searchable-option ${!value ? 'searchable-option-active' : ''}`}
              onClick={() => { onChange(null); setOpen(false); }}
            >
              {allLabel}
            </div>
            {filtered.map(o => (
              <div
                key={o.value}
                className={`searchable-option ${value === o.value ? 'searchable-option-active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
                title={o.label}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="searchable-option searchable-no-results">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Event count filter row
function MatchCountFilter({ filter, onChange, onRemove }) {
  return (
    <div className="count-filter-row">
      <select
        className="count-filter-select"
        value={filter.field}
        onChange={e => onChange({ ...filter, field: e.target.value })}
      >
        {FILTER_EVENTS.map(fe => (
          <option key={fe.key} value={fe.key}>{fe.label}</option>
        ))}
      </select>
      <select
        className="count-filter-select count-filter-op"
        value={filter.op}
        onChange={e => onChange({ ...filter, op: e.target.value })}
      >
        {OPERATORS.map(op => (
          <option key={op.key} value={op.key}>{op.label}</option>
        ))}
      </select>
      <input
        className="count-filter-input"
        type="number"
        min={0}
        value={filter.value}
        onChange={e => onChange({ ...filter, value: e.target.value })}
        placeholder="0"
      />
      <button className="count-filter-remove" onClick={onRemove} title="Remove filter">×</button>
    </div>
  );
}

export default function FilterPanel({
  selectedMap, onMapChange,
  selectedDate, onDateChange,
  showBots, onToggleBots,
  matches, selectedMatchId, onMatchChange,
  players, selectedPlayerId, onPlayerChange,
  enabledEventTypes, onToggleEventType,
  matchFilters, onMatchFiltersChange,
}) {
  const matchOptions = useMemo(() =>
    (matches || []).map(m => ({
      value: m.match_id,
      label: m.display_id,
    })),
    [matches]
  );

  const playerOptions = useMemo(() =>
    (players || []).map(p => ({
      value: p.user_id,
      label: p.is_bot ? `[BOT] ${p.user_id}` : p.user_id,
    })),
    [players]
  );

  const addFilter = () => {
    onMatchFiltersChange([...matchFilters, { field: 'kill_count', op: '>=', value: '' }]);
  };

  const updateFilter = (idx, filter) => {
    const next = [...matchFilters];
    next[idx] = filter;
    onMatchFiltersChange(next);
  };

  const removeFilter = (idx) => {
    onMatchFiltersChange(matchFilters.filter((_, i) => i !== idx));
  };

  return (
    <div className="filter-panel">
      {/* Map filter */}
      <div className="filter-section">
        <h3>Map</h3>
        <div className="btn-group">
          {MAPS.map(m => (
            <button
              key={m}
              className={`btn ${selectedMap === m ? 'btn-active' : ''}`}
              onClick={() => onMapChange(m)}
            >
              {MAP_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Date filter */}
      <div className="filter-section">
        <h3>Date</h3>
        <div className="btn-group">
          {DATES.map(d => (
            <button
              key={d.key}
              className={`btn ${selectedDate === d.key ? 'btn-active' : ''}`}
              onClick={() => onDateChange(d.key)}
            >
              {d.label}{d.partial ? ' *' : ''}
            </button>
          ))}
        </div>
        <span className="hint">* partial day</span>
      </div>

      {/* Match count filter */}
      <div className="filter-section">
        <h3>Filter Matches <span className="hint">(optional)</span></h3>
        {matchFilters.map((f, i) => (
          <MatchCountFilter
            key={i}
            filter={f}
            onChange={(updated) => updateFilter(i, updated)}
            onRemove={() => removeFilter(i)}
          />
        ))}
        <button className="btn btn-sm add-filter-btn" onClick={addFilter}>+ Add filter</button>
      </div>

      {/* Match dropdown - searchable */}
      <div className="filter-section">
        <h3>Match</h3>
        <SearchableSelect
          value={selectedMatchId}
          onChange={onMatchChange}
          options={matchOptions}
          placeholder="Search matches..."
          allLabel={`All Matches (${matches?.length || 0})`}
        />
      </div>

      {/* Player dropdown - searchable */}
      <div className="filter-section">
        <h3>Player</h3>
        <SearchableSelect
          value={selectedPlayerId}
          onChange={onPlayerChange}
          options={playerOptions}
          placeholder="Search players..."
          allLabel="All Players"
        />
      </div>

      {/* Show bots toggle */}
      <div className="filter-section">
        <label className="toggle-label">
          <input type="checkbox" checked={showBots} onChange={onToggleBots} />
          <span>Show Bots</span>
        </label>
      </div>

      {/* Event type filters */}
      <div className="filter-section">
        <h3>Event Types</h3>
        <div className="event-type-filters">
          {EVENT_TYPE_LIST.map(type => {
            const style = EVENT_STYLES[type];
            return (
              <label key={type} className="toggle-label event-type-toggle">
                <input
                  type="checkbox"
                  checked={enabledEventTypes.has(type)}
                  onChange={() => onToggleEventType(type)}
                />
                <span
                  className="event-type-dot"
                  style={{ backgroundColor: style?.color || '#888' }}
                />
                <span>{style?.label || type}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
