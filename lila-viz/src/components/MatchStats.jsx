import { useMemo } from 'react';

const MAP_LABELS = {
  AmbroseValley: 'Ambrose Valley',
  GrandRift: 'Grand Rift',
  Lockdown: 'Lockdown',
};

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MatchStats({
  selectedMap, selectedDate,
  activeData, selectedMatchId, selectedPlayerId,
  matchCount,
}) {
  // Compute stats based on current filter level
  const stats = useMemo(() => {
    if (!activeData) return null;

    // If a specific player is selected, compute stats for that player only
    if (selectedPlayerId) {
      const player = activeData.players.find(p => p.user_id === selectedPlayerId);
      if (!player) return activeData.stats;
      const events = player.events;
      return {
        total_kills: events.filter(e => e.type === 'Kill' || e.type === 'BotKill').length,
        total_deaths: events.filter(e => e.type === 'Killed' || e.type === 'BotKilled').length,
        storm_deaths: events.filter(e => e.type === 'KilledByStorm').length,
        loot_pickups: events.filter(e => e.type === 'Loot').length,
        player_count: player.is_bot ? 0 : 1,
        bot_count: player.is_bot ? 1 : 0,
      };
    }

    return activeData.stats;
  }, [activeData, selectedPlayerId]);

  if (!stats) return null;

  const mapLabel = MAP_LABELS[selectedMap] || selectedMap;
  const matchLabel = selectedMatchId
    ? `Match ${selectedMatchId}`
    : `${matchCount || 0} matches`;

  return (
    <div className="match-stats">
      <span className="stat"><strong>{mapLabel}</strong></span>
      <span className="stat">{selectedDate}</span>
      <span className="stat">{matchLabel}</span>
      {selectedPlayerId && (
        <span className="stat">Player: {selectedPlayerId}</span>
      )}
      <span className="stat-divider">|</span>
      <span className="stat">{stats.player_count} players</span>
      <span className="stat">{stats.bot_count} bots</span>
      <span className="stat stat-kills">{stats.total_kills} kills</span>
      <span className="stat stat-deaths">{stats.total_deaths} deaths</span>
      <span className="stat stat-storm">{stats.storm_deaths} storm</span>
      <span className="stat stat-loot">{stats.loot_pickups} loot</span>
    </div>
  );
}
