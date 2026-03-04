# Design Trade-offs — LILA BLACK Player Journey Visualizer

This document covers the key design decisions made during development, the alternatives considered, and why each trade-off was chosen.

---

## 1. Pre-computed Coordinates vs Runtime Conversion

**Decision**: Pre-compute pixel coordinates (`px`, `py`) in the Python pipeline and store them in JSON.

**Alternative**: Store raw world coordinates and convert at render time using map config (origin, scale).

**Why this way**:
- Eliminates per-frame math — the browser never touches world coordinates or map configs
- Simplifies the frontend — MapCanvas just reads `px`, `py` directly
- Pipeline already has all map configs, so the conversion is trivial to add
- JSON size increases ~15% (extra `px`/`py` fields), but total data is only ~4 MB so it's negligible

**When you'd pick the alternative**: If map configs could change dynamically (e.g., minimap resolution isn't always 1024), runtime conversion would be necessary.

---

## 2. Individual Match Files vs Single Bundle

**Decision**: 796 separate JSON files (~5 KB each) loaded on demand, instead of one ~4 MB bundle.

**Alternative**: A single `all_matches.json` containing everything.

**Why this way**:
- Initial page load is instant — only `index.json` (50 KB) is fetched at startup
- Match data loads on demand when selected, with an LRU cache (20 matches)
- Browser caches individual files, so revisiting a match is free
- "All Matches" mode loads all files for a map+date in parallel — still fast since each file is tiny

**When you'd pick the alternative**: If typical usage always needs all data upfront (e.g., a dashboard view aggregating all matches). A single bundle avoids 200+ HTTP requests.

---

## 3. HTML5 Canvas vs WebGL vs SVG

**Decision**: HTML5 Canvas 2D for all map rendering.

**Alternatives**:
- **SVG**: DOM-based, declarative, easy event handling
- **WebGL**: GPU-accelerated, highest throughput (via deck.gl or raw shaders)

**Why Canvas**:
- ~89K events, but only a few thousand visible at any time per match — well within Canvas 2D limits
- SVG would create thousands of DOM nodes (one per trail segment + marker), causing severe layout thrashing during zoom/pan
- WebGL adds significant complexity (shader programs, buffer management, texture atlas) for marginal gain at this data volume
- Canvas gives pixel-perfect control over marker shapes, trail rendering, and heatmap overlays

**When you'd pick WebGL**: If the dataset grew 10x+ (millions of events) or real-time streaming was added. deck.gl's ScatterplotLayer and PathLayer would handle that scale.

**When you'd pick SVG**: If the data were sparse (<100 markers) and complex interaction (hover effects, CSS animations) were priorities.

---

## 4. Static Pre-computed Heatmaps vs Client-side Dynamic Heatmaps

**Decision**: Heatmap grids are pre-computed per-map in the pipeline (aggregating all dates/matches), stored as JSON grid files.

**Alternative**: Compute heatmaps dynamically in the browser based on the current filter selection (specific match, player, date range).

**Why this way**:
- Zero render-time computation — just read the grid and draw colored cells
- Pipeline can use `scipy.gaussian_filter` for smooth Gaussian blurring, which isn't available in the browser without a library
- Consistent results — same heatmap regardless of what match/date is selected

**Trade-off acknowledged**: Heatmaps don't filter by match or player. They show map-wide aggregate patterns. This is noted in the "What I'd Do With More Time" section.

**How to add dynamic heatmaps**: Compute a grid from `activeData.players[*].events` in a `useMemo` — iterate events, bucket into grid cells, normalize, apply a JavaScript Gaussian blur. Would add ~50 lines of code.

---

## 5. Searchable Custom Dropdown vs Native `<select>`

**Decision**: Custom searchable dropdown component replacing native `<select>`.

**Alternative**: Native `<select>` elements (original implementation).

**Why this way**:
- Match IDs are long UUIDs — native `<select>` truncates them and provides no search
- Custom dropdown allows full-text search, full ID display, and consistent styling across browsers
- Match/player lists can have 200+ entries, making search essential for usability

**Trade-off**: Custom dropdowns require more code (~80 lines), need manual outside-click handling, and don't get native accessibility features (screen reader support, keyboard navigation) for free.

---

## 6. LRU Cache Size (20 matches)

**Decision**: Cache the 20 most recently loaded match JSON files in memory.

**Why 20**: Balances memory (~100 KB × 20 = ~2 MB) against re-fetch frequency. Users typically explore 5-10 matches in a session, so 20 covers most back-and-forth navigation without re-fetching.

**Alternative**: Cache everything (all 796 matches = ~4 MB) or cache nothing (always re-fetch).

---

## 7. CSS Variables for Theming vs CSS-in-JS

**Decision**: Light/dark theme via CSS custom properties (`--bg-primary`, etc.) on `:root`.

**Alternative**: CSS-in-JS (styled-components, emotion) or Tailwind CSS.

**Why CSS variables**:
- Theme switch is a single attribute change (`data-theme="dark"`) — instant, no JS re-renders
- All 15+ color tokens defined once, used everywhere
- No build-time cost or runtime overhead
- Works with plain CSS — no additional dependencies

---

## 8. Kill Victim Correlation via Timestamp + Proximity

**Decision**: Match Kill events to Killed events by finding the closest player death within 1 second and 50 pixels.

**Alternative**: The telemetry data doesn't include explicit killer→victim links, so this heuristic is necessary.

**Why these thresholds**:
- 1 second: Game events are logged near-simultaneously, but network jitter can cause small offsets
- 50 pixels: Kill and death should be co-located, but slight position differences occur between the killer's and victim's logged coordinates
- Best-match approach: If multiple candidates exist, the closest by distance wins

**Limitation**: In dense combat areas with simultaneous kills, the correlation may incorrectly pair events. With more time, I'd add a confidence score and only show victims above a threshold.

---

## 9. Event Type Filter (Client-side) vs Pipeline Pre-filtering

**Decision**: Filter event types in the browser via checkbox toggles.

**Alternative**: Pre-compute separate JSON files for different event type combinations.

**Why client-side**: Only 6 event types with 64 possible combinations — generating separate files for each would be wasteful. Client-side filtering is O(n) per frame and trivially fast.

---

## 10. Match Count Filter (Index-level) vs Full Match Loading

**Decision**: Filter matches by event counts using fields stored in `index.json` (kill_count, death_count, etc.) before loading match data.

**Alternative**: Load all match JSON files, then filter based on computed stats.

**Why index-level**: Avoids loading hundreds of match files just to check if they meet filter criteria. The index is already in memory (~50 KB), so filtering is instant. Required adding extra stat fields (death_count, storm_death_count, loot_count) to the pipeline's index output.

---

## Summary Table

| Decision | Chosen | Alternative | Key Factor |
|---|---|---|---|
| Coordinates | Pre-computed | Runtime conversion | Eliminate per-frame math |
| Data format | Individual files | Single bundle | Fast initial load |
| Renderer | Canvas 2D | WebGL / SVG | Right complexity for data volume |
| Heatmaps | Static (pipeline) | Dynamic (client) | Zero render cost |
| Dropdowns | Custom searchable | Native `<select>` | Full IDs + search UX |
| Cache | LRU 20 | All / None | Memory vs re-fetch balance |
| Theming | CSS variables | CSS-in-JS | Zero-cost theme switch |
| Kill→Victim | Timestamp+proximity | N/A (no data link) | Best available heuristic |
| Event filter | Client-side | Pre-filtered files | 6 types, 64 combos — trivial |
| Match filter | Index-level | Load-then-filter | Avoid loading 796 files |
