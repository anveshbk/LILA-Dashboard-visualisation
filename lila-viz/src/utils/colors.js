// 10 preset high-contrast colors for player trails (bright neon on dark/light maps)
export const PLAYER_COLORS = [
  '#00ffff', // cyan
  '#ff00ff', // magenta
  '#ffff00', // yellow
  '#00ff00', // lime
  '#ff6600', // orange
  '#ff0066', // hot pink
  '#6666ff', // blue-violet
  '#00ff99', // spring green
  '#ff3333', // red
  '#33ccff', // sky blue
];

// Assign color by index (cycles if >10 players)
export function getPlayerColorByIndex(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// Bot color
export const BOT_COLOR = '#888888';

export function getPlayerColor(userId, isBot, playerIndex = 0, alpha = 1) {
  if (isBot) return `rgba(136, 136, 136, ${alpha * 0.6})`;
  const hex = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getPlayerColorHex(userId, isBot, playerIndex = 0) {
  if (isBot) return BOT_COLOR;
  return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
}

// Event marker styles — brighter neon colors with white outlines for visibility
export const EVENT_STYLES = {
  Kill:          { shape: 'crosshair', color: '#ff1111', label: 'Kill (PvP)' },
  Killed:        { shape: 'x',         color: '#ff1111', label: 'Death (PvP)' },
  BotKill:       { shape: 'crosshair', color: '#ff8800', label: 'Bot Kill' },
  BotKilled:     { shape: 'x',         color: '#ff8800', label: 'Bot Death' },
  KilledByStorm: { shape: 'diamond',   color: '#dd44ff', label: 'Storm Death' },
  Loot:          { shape: 'square',    color: '#44ff44', label: 'Loot' },
};

// Heatmap gradient: 0-1 → transparent → yellow → red
export function heatmapGradient(value) {
  if (value <= 0) return 'rgba(0,0,0,0)';
  const r = Math.min(255, Math.floor(value * 2 * 255));
  const g = Math.min(255, Math.floor((1 - value) * 2 * 255));
  const a = Math.min(0.7, value * 0.8 + 0.1);
  return `rgba(${r}, ${g}, 0, ${a})`;
}
