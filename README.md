# LILA BLACK — Player Journey Visualizer

A browser-based visualization tool for exploring player telemetry data from **LILA BLACK**, an extraction shooter by LILA Games. Built for the Level Design team to analyze player movement, combat hotspots, loot patterns, and storm death zones across 3 game maps.

**Live Demo**: [https://lila-viz.vercel.app](https://lila-viz.vercel.app)

---

## Features

### Data Pipeline
- Processes **1,243 parquet files** (~10 MB) into **796 match JSON files** (~4 MB)
- **89,104 events** with post-write verification (parquet count = JSON count, zero data loss)
- World-to-pixel coordinate conversion for 3 maps using map-specific origin/scale configs
- Cross-validated bot detection (UUID format = human, numeric = bot)
- Gaussian-smoothed heatmap grids for 5 event types (traffic, kills, deaths, loot, storm deaths)
- Minimap resizing to 1024x1024 with aspect ratio handling

### Visualization
- **HTML5 Canvas rendering** — handles thousands of draw calls per frame for ~89K events
- **Zoom & Pan** — scroll wheel to zoom, drag to pan, `R` to reset
- **Playback system** — play/pause with 1x/2x/4x speed control and timeline scrubber
- **10-color player trails** — preset neon colors cycling across players, with black outlines for contrast
- **Event markers** — distinct shapes and colors for Kill, Death, Bot Kill, Bot Death, Storm Death, Loot
- **Heatmap overlays** — 5 types: Traffic, Kills, Deaths, Loot, Storm Deaths (radio selection, one at a time)
- **Trail toggle** — independent of heatmap, can hide trails while viewing heatmap
- **Light/Dark theme** — CSS variable-based, persisted in localStorage

### Filtering & Search
- **Map filter** — Ambrose Valley, Grand Rift, Lockdown
- **Date filter** — Feb 10-14, 2026 (5 days of telemetry)
- **Searchable match dropdown** — full match IDs with text search
- **Searchable player dropdown** — full player IDs, bot indicator
- **Match count filter** — optional filters like "kills >= 3" or "loot > 5" to narrow match list. Supports: Kills, Deaths, Storm Deaths, Loot, Players, Bots with operators >=, <=, >, <, ==
- **Event type checkboxes** — toggle visibility of Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot markers
- **Show/hide bots** — toggle bot trails and markers

### Interaction
- **Click event markers** — tooltip showing event type, player ID, human/bot status, timestamp, coordinates
- **Player event list** — sidebar panel for selected player showing all combat/loot events with hover-to-highlight on map
- **Kill victim correlation** — for Kill/BotKill events, identifies the killed player by matching timestamps (±1s) and proximity (≤50px)
- **Keyboard shortcuts** — `R` reset zoom, `Esc` deselect player

---

## Data Overview

| Map | Total Matches | Feb 10 | Feb 11 | Feb 12 | Feb 13 | Feb 14 |
|---|---|---|---|---|---|---|
| Ambrose Valley | 566 | 200 | 137 | 127 | 78 | 24 |
| Grand Rift | 59 | 24 | 13 | 9 | 5 | 8 |
| Lockdown | 171 | 61 | 50 | 26 | 29 | 5 |
| **Total** | **796** | **285** | **200** | **162** | **112** | **37** |

**Event Types**: Position, BotPosition, Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot

### Data Integrity Verification

The pipeline includes post-write verification ensuring zero data loss from parquet source to JSON output.

**Source (Parquet files):**

| Day | Files | Rows |
|---|---|---|
| February 10 | 437 | 33,687 |
| February 11 | 293 | 21,235 |
| February 12 | 268 | 18,429 |
| February 13 | 166 | 11,106 |
| February 14 | 79 | 4,647 |
| **Total** | **1,243** | **89,104** |

**Output (Match JSON files):**

| Day | Match JSONs | Events |
|---|---|---|
| 2026-02-10 | 285 | 33,958 |
| 2026-02-11 | 200 | 20,964 |
| 2026-02-12 | 162 | 18,429 |
| 2026-02-13 | 112 | 11,106 |
| 2026-02-14 | 37 | 4,647 |
| **Total** | **796** | **89,104** |

**Grand total: 89,104 parquet rows = 89,104 JSON events (exact match, zero loss)**

Notes:
- File count differs (1,243 → 796) because multiple parquet files can belong to the same match (different `.nakama-X` suffixes) and are merged into one JSON per match
- Feb 10/11 per-day row counts differ slightly between source and output because some matches span midnight — the pipeline groups by match timestamp, not by source folder. The grand total is identical

---

## Project Structure

```
LILA-Assignment/
├── README.md                    # This file
├── ARCHITECTURE.md              # 1-page architecture & trade-offs doc
├── IMPLEMENTATION_PLAN.md       # Detailed implementation plan (3 phases)
├── TRADEOFFS.md                 # Design decisions and trade-off analysis
├── TEST_CASES.md                # Manual test cases and verification steps
├── CHANGELOG.md                 # Version history
│
├── scripts/
│   ├── process_data.py          # Data pipeline (parquet → JSON)
│   └── pipeline_report.json     # Pipeline execution report
│
├── player_data/                 # Raw parquet files (input)
│   ├── February_10/
│   ├── February_11/
│   ├── February_12/
│   ├── February_13/
│   └── February_14/
│
├── public/                      # Pipeline output (also copied to lila-viz/public/)
│   ├── data/
│   │   ├── index.json           # Match index (map → date → matches)
│   │   ├── matches/             # 796 per-match JSON files
│   │   └── heatmaps/            # 15 heatmap grids (3 maps × 5 types)
│   └── minimaps/                # 3 minimap images (1024×1024)
│
└── lila-viz/                    # React + Vite frontend
    ├── package.json
    ├── vite.config.js
    ├── public/                  # Static assets (data, minimaps)
    └── src/
        ├── App.jsx              # Root component, state management
        ├── App.css              # Global styles, theme variables
        ├── components/
        │   ├── FilterPanel.jsx  # Map/date/match/player filters + event filter + match count filter
        │   ├── MapCanvas.jsx    # Canvas renderer (minimap, trails, markers, heatmap)
        │   ├── MatchStats.jsx   # Filter-aware stats bar
        │   ├── EventList.jsx    # Player event list with victim correlation
        │   ├── EventTooltip.jsx # Click-to-inspect event tooltip
        │   ├── HeatmapOverlay.jsx # Heatmap radio buttons + trail toggle
        │   ├── Legend.jsx       # Map legend with event shapes and shortcuts
        │   └── Timeline.jsx     # Playback controls (play/pause, speed, scrubber)
        ├── hooks/
        │   ├── useMatchData.js  # Data loading, LRU cache, heatmap fetching
        │   └── usePlayback.js   # requestAnimationFrame playback with delta-time
        └── utils/
            └── colors.js        # Player colors, event styles, heatmap gradient
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Data Pipeline | Python (pandas, pyarrow, scipy, Pillow) | Native parquet support, fast aggregation |
| Frontend | React 18 + Vite | Component model, instant HMR, optimized builds |
| Rendering | HTML5 Canvas 2D | Handles 89K events without DOM overhead |
| Styling | CSS Variables | Theme switching without JS re-renders |
| Hosting | Vercel (static) | Zero-config deploy, free tier, instant URL |

---

## Getting Started

### Prerequisites
- Python 3.8+ with `pyarrow`, `pandas`, `numpy`, `scipy`, `Pillow`
- Node.js 18+

### Run the Data Pipeline

```bash
# Install Python dependencies
pip install pyarrow pandas numpy scipy Pillow

# Run pipeline (processes parquet → JSON)
python scripts/process_data.py
```

This reads from `player_data/` and outputs to `public/data/` and `public/minimaps/`.

### Run the Frontend

```bash
cd lila-viz

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
cd lila-viz
npm run build
```

Output is in `lila-viz/dist/`.

### Deploy to Vercel

```bash
cd lila-viz
npx vercel --prod
```

---

## How to Use

1. **Select a map** — click Ambrose Valley, Grand Rift, or Lockdown
2. **Select a date** — Feb 10 through Feb 14
3. **(Optional) Filter matches** — click "+ Add filter" to narrow by event counts (e.g., kills >= 3)
4. **Select a match** — use the searchable dropdown, or leave as "All Matches" to see aggregate data
5. **Select a player** — drill down to a single player's journey
6. **Explore the map** — scroll to zoom, drag to pan, click markers for details
7. **Toggle overlays** — enable heatmaps (Traffic, Kills, Deaths, Loot, Storm Deaths), toggle trails on/off
8. **Filter event types** — use checkboxes to show/hide specific event markers
9. **Use playback** — play/pause button and timeline scrubber to animate events over time

---

## Coordinate System

World coordinates from telemetry are converted to minimap pixels using:

```
u = (world_x - origin_x) / scale
v = (world_z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024    // Y-axis inverted
```

Map configs:
| Map | Scale | Origin X | Origin Z |
|---|---|---|---|
| Ambrose Valley | 900 | -370 | -473 |
| Grand Rift | 581 | -290 | -290 |
| Lockdown | 1000 | -500 | -500 |

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture and design decisions
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Detailed 3-phase implementation plan
- [TRADEOFFS.md](TRADEOFFS.md) — Design trade-offs and alternatives considered
- [TEST_CASES.md](TEST_CASES.md) — Manual test cases for verification
- [CHANGELOG.md](CHANGELOG.md) — Version history and changes
