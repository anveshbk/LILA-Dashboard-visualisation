import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMatchData } from './hooks/useMatchData';
import { usePlayback } from './hooks/usePlayback';
import FilterPanel from './components/FilterPanel';
import MatchStats from './components/MatchStats';
import MapCanvas from './components/MapCanvas';
import Timeline from './components/Timeline';
import Legend from './components/Legend';
import EventTooltip from './components/EventTooltip';
import HeatmapOverlay from './components/HeatmapOverlay';
import EventList from './components/EventList';
import './App.css';

const ALL_EVENT_TYPES = ['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot'];

function applyOp(value, op, threshold) {
  switch (op) {
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '>':  return value > threshold;
    case '<':  return value < threshold;
    case '==': return value === threshold;
    default: return true;
  }
}

export default function App() {
  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('lila-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lila-theme', theme);
  }, [theme]);

  // Filters
  const [selectedMap, setSelectedMap] = useState('AmbroseValley');
  const [selectedDate, setSelectedDate] = useState('2026-02-10');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [showBots, setShowBots] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [activeHeatmap, setActiveHeatmap] = useState(null);
  const [tooltipEvent, setTooltipEvent] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [hoveredEventIdx, setHoveredEventIdx] = useState(null);
  const [enabledEventTypes, setEnabledEventTypes] = useState(new Set(ALL_EVENT_TYPES));
  const [matchFilters, setMatchFilters] = useState([]);

  const {
    index, loading,
    activeData, matchLoading,
    loadMatch, loadAllMatches, clearMatch,
    heatmapData, loadHeatmap,
  } = useMatchData();

  // Matches for current map+date, filtered by match count filters
  const currentMatches = useMemo(() => {
    if (!index || !index[selectedMap] || !index[selectedMap][selectedDate]) return [];
    let matches = [...index[selectedMap][selectedDate]].sort((a, b) => b.player_count - a.player_count);

    // Apply match count filters
    for (const f of matchFilters) {
      const threshold = parseFloat(f.value);
      if (isNaN(threshold)) continue; // skip if no valid number entered
      matches = matches.filter(m => applyOp(m[f.field] ?? 0, f.op, threshold));
    }

    return matches;
  }, [index, selectedMap, selectedDate, matchFilters]);

  // Players for current active data (respects showBots)
  const currentPlayers = useMemo(() => {
    if (!activeData) return [];
    const seen = new Set();
    return activeData.players.filter(p => {
      if (seen.has(p.user_id)) return false;
      seen.add(p.user_id);
      if (!showBots && p.is_bot) return false;
      return true;
    });
  }, [activeData, showBots]);

  // Player index map for consistent coloring
  const playerIndexMap = useMemo(() => {
    const map = {};
    let humanIdx = 0;
    if (activeData) {
      const seen = new Set();
      for (const p of activeData.players) {
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        if (!p.is_bot) {
          map[p.user_id] = humanIdx++;
        }
      }
    }
    return map;
  }, [activeData]);

  // Selected player object
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId || !activeData) return null;
    return activeData.players.find(p => p.user_id === selectedPlayerId) || null;
  }, [selectedPlayerId, activeData]);

  const playback = usePlayback(activeData?.duration_seconds || 0);
  const mapCanvasRef = useRef(null);

  const currentHeatmapKey = activeHeatmap ? `${selectedMap}_${activeHeatmap}` : null;
  const currentHeatmapGrid = currentHeatmapKey ? heatmapData[currentHeatmapKey] : null;

  // Load heatmap when toggled
  useEffect(() => {
    if (activeHeatmap && selectedMap) {
      loadHeatmap(selectedMap, activeHeatmap);
    }
  }, [activeHeatmap, selectedMap, loadHeatmap]);

  // When map or date changes, reset match and player selection
  useEffect(() => {
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
    clearMatch();
  }, [selectedMap, selectedDate, clearMatch]);

  // When match changes, reset player selection
  useEffect(() => {
    setSelectedPlayerId(null);
    setTooltipEvent(null);
    setHoveredEventIdx(null);
  }, [selectedMatchId]);

  // Load match data when match selection changes
  useEffect(() => {
    if (selectedMatchId) {
      loadMatch(selectedMatchId);
    } else if (currentMatches.length > 0) {
      loadAllMatches(currentMatches.map(m => m.match_id));
    }
  }, [selectedMatchId, currentMatches, loadMatch, loadAllMatches]);

  // Show all events on load
  useEffect(() => {
    if (activeData) {
      playback.setCurrentTime(activeData.duration_seconds);
    }
  }, [activeData?.match_id]);

  const handleMatchChange = useCallback((matchId) => {
    setSelectedMatchId(matchId);
  }, []);

  const handlePlayerChange = useCallback((playerId) => {
    setSelectedPlayerId(playerId);
    setHoveredEventIdx(null);
  }, []);

  const handleEventClick = useCallback((event, position) => {
    setTooltipEvent(event);
    setTooltipPos(position);
  }, []);

  const handleToggleEventType = useCallback((type) => {
    setEnabledEventTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case 'Escape':
          setSelectedPlayerId(null);
          setTooltipEvent(null);
          setHoveredEventIdx(null);
          break;
        case 'r': case 'R':
          if (mapCanvasRef.current) mapCanvasRef.current.resetZoom();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading data...</div>;
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-company">LILA</span>
            <span className="brand-game">LILA BLACK</span>
          </div>
          <span className="subtitle">Player Journey Visualizer</span>
        </div>

        <FilterPanel
          selectedMap={selectedMap}
          onMapChange={setSelectedMap}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          showBots={showBots}
          onToggleBots={() => setShowBots(b => !b)}
          matches={currentMatches}
          selectedMatchId={selectedMatchId}
          onMatchChange={handleMatchChange}
          players={currentPlayers}
          selectedPlayerId={selectedPlayerId}
          onPlayerChange={handlePlayerChange}
          enabledEventTypes={enabledEventTypes}
          onToggleEventType={handleToggleEventType}
          matchFilters={matchFilters}
          onMatchFiltersChange={setMatchFilters}
        />

        {/* Event list when a specific player is selected */}
        {selectedPlayer && (
          <EventList
            player={selectedPlayer}
            allPlayers={activeData?.players || []}
            hoveredEventIdx={hoveredEventIdx}
            onHoverEvent={setHoveredEventIdx}
            onLeaveEvent={() => setHoveredEventIdx(null)}
            enabledEventTypes={enabledEventTypes}
          />
        )}
      </aside>

      {/* Main area */}
      <main className="main">
        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <MatchStats
          selectedMap={selectedMap}
          selectedDate={selectedDate}
          activeData={activeData}
          selectedMatchId={selectedMatchId}
          selectedPlayerId={selectedPlayerId}
          matchCount={currentMatches.length}
        />

        <div className="canvas-area">
          <MapCanvas
            ref={mapCanvasRef}
            activeData={activeData}
            currentTime={playback.currentTime}
            showBots={showBots}
            showTrails={showTrails}
            selectedPlayerId={selectedPlayerId}
            heatmapGrid={currentHeatmapGrid}
            mapId={selectedMap}
            onEventClick={handleEventClick}
            hoveredEventIdx={hoveredEventIdx}
            playerIndexMap={playerIndexMap}
            enabledEventTypes={enabledEventTypes}
          />
          <Legend />
          {tooltipEvent && tooltipPos && (
            <EventTooltip
              event={tooltipEvent}
              position={tooltipPos}
              onClose={() => setTooltipEvent(null)}
            />
          )}
          {matchLoading && <div className="canvas-loading">Loading match data...</div>}
        </div>

        <div className="bottom-bar">
          <HeatmapOverlay
            activeHeatmap={activeHeatmap}
            onToggle={setActiveHeatmap}
            showTrails={showTrails}
            onToggleTrails={() => setShowTrails(t => !t)}
          />
          <Timeline {...playback} />
        </div>
      </main>
    </div>
  );
}
