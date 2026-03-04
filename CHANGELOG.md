# Changelog

## v2.1 — Match Filters & Cleanup

### New Features
- **Match Count Filter**: Optional filter to narrow matches by event counts (e.g., kills >= 3, loot > 5). Supports fields: Kills, Deaths, Storm Deaths, Loot, Players, Bots. Operators: >=, <=, >, <, ==. Multiple filters can be stacked.
- **Clean Match Dropdown**: Match dropdown now shows only the match ID (stats removed since the top bar already shows them)

### Changes
- Removed Space (play/pause) and arrow key (step ±1s) keyboard shortcuts — only R (reset zoom) and Esc (deselect) remain
- Legend updated to remove Space/arrow shortcut references

### Pipeline
- Added `death_count`, `storm_death_count`, `loot_count` fields to index.json for each match entry (used by the match count filter)

---

## v2.0 — UX Overhaul (Round 2)

### New Features
- **Searchable Dropdowns**: Match and player dropdowns now show full IDs (no truncation) with a search/filter input field
- **Event Type Filters**: Sidebar checkboxes for Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot — hides markers on map and in event list when unchecked
- **Trail Toggle**: Independent enable/disable for player trails in the bottom bar, works alongside heatmap overlays
- **Loot Heatmap**: New heatmap type showing loot pickup density (32×32 grid, sigma 0.8)
- **Storm Deaths Heatmap**: New heatmap type showing storm death locations (24×24 grid, sigma 1.2)
- **Heatmap Radio Selection**: Heatmaps are now mutually exclusive (one at a time) — 5 options: Traffic, Kills, Deaths, Loot, Storm Deaths

### Fixes
- **Full IDs Everywhere**: Match IDs and player IDs are no longer truncated in dropdowns, stats bar, or event list victim display

### Pipeline
- Added `loot` and `storm_deaths` entries to `HEATMAP_CONFIG` in `process_data.py`
- Generated 6 new heatmap JSON files (3 maps × 2 new types)

---

## v1.1 — UX Overhaul (Round 1)

### New Features
- **Dropdown Filters**: Replaced scrollable match/player card lists with dropdown selectors
- **"All Matches" Mode**: Default view loads and merges all matches for the selected map+date
- **"All Players" Mode**: Default shows all player trails with 10 preset neon colors (cycling)
- **Event List Panel**: Sidebar panel showing non-position events for the selected player with hover-to-highlight on map
- **Kill Victim Correlation**: Kill/BotKill events show the killed player ID, found by matching timestamps (±1s) and proximity (≤50px)
- **Light/Dark Theme**: CSS variable-based theming with sun/moon icon toggle in top-right corner, persisted in localStorage
- **Bigger Markers**: Event markers increased to 12px base size with black outlines for visibility on bright/dark maps
- **Filter-Aware Stats**: Stats bar updates based on selected match and player

### Changes
- Sidebar header updated to: LILA (company) > LILA BLACK (game) > Player Journey Visualizer (subtitle)
- Trail rendering now includes black outline underneath colored trail for contrast
- LRU cache increased from 10 to 20 matches

---

## v1.0 — Initial Release

### Data Pipeline
- Python script (`scripts/process_data.py`) processing 1,243 parquet files into 796 match JSON files
- 89,104 total events with post-write verification (parquet count = JSON count)
- World-to-pixel coordinate conversion for 3 maps: AmbroseValley, GrandRift, Lockdown
- Bot detection via user_id format (UUID = human, numeric = bot)
- Gaussian-smoothed heatmap grids for traffic, kills, and deaths
- Minimap resizing to 1024×1024 (with padding for non-square GrandRift)

### Frontend
- React + Vite SPA with HTML5 Canvas rendering
- Zoom/pan with scroll wheel and drag
- Playback system with requestAnimationFrame, 1×/2×/4× speed
- Keyboard shortcuts: Space, ←→, R, Esc
- Legend with event shapes, trail styles, and keyboard shortcut reference
- Event tooltips on click (type, player ID, human/bot, time, coordinates)
- Heatmap overlay toggle
- Deployed to Vercel
