# Architecture — LILA BLACK Player Journey Visualizer

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Data Pipeline** | Python (pandas, pyarrow, scipy) | Parquet files are a Python-native format; pandas makes aggregation and coordinate transforms trivial |
| **Frontend** | React + Vite | Fast dev iteration, component model fits the multi-panel UI; Vite gives instant HMR and optimized builds |
| **Rendering** | HTML5 Canvas (2D) | ~89K events across hundreds of players — DOM nodes would be too slow. Canvas handles thousands of draw calls per frame with zoom/pan transforms |
| **Hosting** | Vercel (static) | Zero-config deploy for Vite apps, free tier, instant shareable URL |

## Data Flow

```
1,243 parquet files (10 MB)
        │
        ▼
  scripts/process_data.py
  • Loads all files via pyarrow → pandas
  • Decodes bytes → event strings
  • Cross-validates bot detection (user_id format vs event type)
  • Normalizes timestamps to relative match time (0 → duration)
  • Pre-computes pixel coordinates (world → minimap UV → 1024px)
  • Builds per-match JSON with nested players and events
  • Generates heatmap grids: traffic (64×64), kills/deaths/storm_deaths (24×24), loot (32×32)
  • Gaussian smoothing on heatmap grids (sigma varies per type)
  • Resizes minimaps to 1024×1024 (pads GrandRift to square first)
  • Post-write verification: re-reads all JSON, asserts event count = parquet rows
        │
        ▼
  public/data/ (~4 MB JSON)
  ├── index.json          — match index grouped by map → date
  ├── matches/{id}.json   — 796 per-match files with pre-computed stats
  └── heatmaps/           — 15 grid files (3 maps × 5 types)
        │
        ▼
  Browser (React SPA)
  • Loads index.json on mount → populates sidebar filters
  • Fetches per-match JSON on selection (LRU cache, 20 matches)
  • "All Matches" mode merges all matches for a map+date combo
  • Canvas renders: minimap → heatmap overlay → trails → event markers → position dots
  • requestAnimationFrame playback with delta-time at 1×/2×/4× speed
```

## UI Architecture

### Sidebar (Left Panel)
- **Header**: LILA branding (company + game + subtitle)
- **Filter Panel**: Map buttons, date buttons, searchable match/player dropdowns, show bots toggle, event type filter checkboxes
- **Event List**: Shows non-position events for selected player with kill victim correlation (timestamp + proximity matching)

### Main Area (Right)
- **Match Stats Bar**: Filter-aware stats (adapts to selected match/player)
- **Canvas Area**: Minimap + heatmap overlay + player trails + event markers. Supports zoom (scroll wheel), pan (drag), click-to-inspect events
- **Bottom Bar**: Trail toggle, heatmap radio buttons (5 types), playback timeline with speed control

### Key Features
- **Light/Dark Theme**: CSS variable-based theming with toggle button (persisted in localStorage)
- **Searchable Dropdowns**: Custom dropdown components with text search for match/player selection — shows full IDs
- **10-Color Player Trails**: Preset neon colors cycling for multi-player visibility, with black outlines for contrast on any background
- **Event Type Filtering**: Checkbox toggles for Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot — hides markers on map and in event list
- **Trail Toggle**: Independent of heatmap — can show/hide trails while viewing heatmap overlays
- **Keyboard Shortcuts**: R (reset zoom), Esc (deselect player)
- **Kill Victim Correlation**: For Kill/BotKill events, finds the killed player by matching timestamps within 1s and proximity within 50px

## Key Trade-offs

**Pre-computed coordinates vs runtime conversion**: I pre-compute pixel coords (px, py) in the pipeline so the browser never touches world coordinates or map config. Increases JSON size slightly but eliminates runtime math per frame.

**Individual match files vs single bundle**: 796 small JSON files (~5 KB each) instead of one ~4 MB bundle. Initial load is instant (just index.json), and matches load on demand. Trade-off: more HTTP requests, but each is tiny and cached.

**Canvas vs WebGL/SVG**: Canvas gives enough performance for this data volume without WebGL complexity. SVG would choke on thousands of path elements. If the dataset grew 10×, I'd switch to WebGL (deck.gl or raw).

**Static heatmaps vs dynamic**: Pre-computed in pipeline at the per-map level. Faster renders but heatmaps don't filter by match/player selection. Client-side heatmap computation would enable this but adds complexity.

**Refs for keyboard shortcuts**: Keyboard handler uses a single global `keydown` listener registered once on mount, avoiding re-registration on every render.

## What I'd Do With More Time

- **Client-side heatmap computation**: Generate heatmaps from active match/player data on-the-fly for truly filter-aware heat overlays
- **Cross-match player search**: Find all matches for a specific player across all dates — useful for tracking individual player behavior patterns
- **WebSocket live data**: Stream new match data in real-time as games finish
- **Minimap annotations**: Let Level Designers drop named markers (e.g., "sniper nest", "choke point") and share them with the team
- **Performance profiling**: For very large matches, virtualize the player list and use offscreen canvas for pre-rendering trails
- **Export**: Download the current view as PNG or match data as CSV for external analysis
