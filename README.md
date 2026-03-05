# LILA BLACK — Player Journey Visualizer

A browser-based visualization tool for exploring player telemetry data from **LILA BLACK**, an extraction shooter by LILA Games. Built for the Level Design team to analyze player movement, combat hotspots, loot patterns, and storm death zones across 3 game maps.

**Live Demo**: [https://lila-viz.vercel.app](https://lila-viz.vercel.app)

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Data Pipeline | Python (pandas, pyarrow, scipy, Pillow) | Native parquet support, fast aggregation |
| Frontend | React 18 + Vite | Component model, instant HMR, optimized builds |
| Rendering | HTML5 Canvas 2D | Handles 89K events without DOM overhead |
| Styling | CSS Custom Properties | Theme switching without JS re-renders |
| Hosting | Vercel (static) | Zero-config deploy, free tier, instant URL |

---

## Architecture Summary

```
1,243 parquet files (10 MB)
        │
        ▼  scripts/process_data.py
        │  Loads parquet → decodes events → validates bots
        │  Normalizes timestamps → pre-computes pixel coords
        │  Builds 796 match JSONs + 15 heatmap grids
        │  Post-write verification: 89,104 events (zero loss)
        ▼
  public/data/ (~4 MB JSON)
  ├── index.json          match index (map → date → matches)
  ├── matches/*.json      796 per-match files
  └── heatmaps/*.json     15 grids (3 maps × 5 types)
        │
        ▼  Browser (React SPA)
        │  Loads index → fetches matches on demand (LRU cache)
        │  Canvas renders: minimap → heatmap → trails → markers
        ▼
  Interactive map with filterable player journeys
```

---

## Project Structure

```
LILA-Assignment/
├── README.md                    # This file
├── ARCHITECTURE.md              # Tech stack, data flow, trade-offs, future work
├── IMPLEMENTATION_PLAN.md       # Detailed 3-phase implementation plan
├── TRADEOFFS.md                 # Design decisions and trade-off analysis
├── TEST_CASES.md                # Manual test cases for verification
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
└── lila-viz/                    # React + Vite frontend
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   ├── data/
    │   │   ├── index.json       # Match index (map → date → matches)
    │   │   ├── matches/         # 796 per-match JSON files
    │   │   └── heatmaps/        # 15 heatmap grids (3 maps × 5 types)
    │   └── minimaps/            # 3 minimap images (1024×1024)
    └── src/
        ├── App.jsx              # Root component, state management
        ├── App.css              # Global styles, theme variables
        ├── components/
        │   ├── FilterPanel.jsx  # Filters + searchable dropdowns + match count filter
        │   ├── MapCanvas.jsx    # Canvas renderer (minimap, trails, markers, heatmap)
        │   ├── MatchStats.jsx   # Filter-aware stats bar
        │   ├── EventList.jsx    # Player event list with victim correlation
        │   ├── EventTooltip.jsx # Click-to-inspect event tooltip
        │   ├── HeatmapOverlay.jsx # Heatmap radio buttons + trail toggle
        │   ├── Legend.jsx       # Map legend with event shapes
        │   └── Timeline.jsx     # Playback controls (play/pause, speed, scrubber)
        ├── hooks/
        │   ├── useMatchData.js  # Data loading, LRU cache, heatmap fetching
        │   └── usePlayback.js   # requestAnimationFrame playback
        └── utils/
            └── colors.js        # Player colors, event styles, heatmap gradient
```

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — Tech stack choices, data flow, trade-offs, future improvements
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Detailed 3-phase implementation plan
- [TRADEOFFS.md](TRADEOFFS.md) — 10 design trade-offs with alternatives considered
- [TEST_CASES.md](TEST_CASES.md) — 40+ manual test cases for verification
- [CHANGELOG.md](CHANGELOG.md) — Version history (v1.0 → v2.1)
