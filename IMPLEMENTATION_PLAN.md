# LILA Player Journey Visualization Tool — Implementation Plan

## Context

LILA Games' Level Design team has raw telemetry data (~89K events, 1,243 parquet files, 5 days) from their extraction shooter "LILA BLACK" but no way to visualize it. We're building a browser-based tool that lets Level Designers explore player movement, combat, and loot patterns on 3 game maps. Deliverables: hosted tool (Vercel URL), git repo, 1-page architecture doc.

---

## Architecture

**Fully static site. No backend.**

- **Data pipeline**: Python script (build-time) reads parquet → outputs structured JSON + validated pipeline report
- **Frontend**: React + Vite, HTML5 Canvas rendering (with zoom/pan), dark theme
- **Hosting**: Vercel (free, shareable URL)

Total data is ~10MB parquet / ~4MB output JSON — fits entirely in browser memory.

---

## Phase 1: Data Pipeline (`scripts/process_data.py`)

**Dependencies**: `pyarrow`, `pandas`, `numpy`, `Pillow` (Pillow only if minimap resize is needed — verify dimensions first)

### Steps:

1. **Load all parquet files** across 5 day folders into a single DataFrame, tag each with source date folder. **Date mapping**: `February_10 → "2026-02-10"`, `February_11 → "2026-02-11"`, etc. — explicit dict in code, not derived.
2. **Decode event column**: `bytes → utf-8 string`, assert each decoded value is one of 8 known event types — flag unknowns
3. **match_id handling**: Keep full `match_id` (including any `.nakama-X` suffix) for grouping. Store a `display_id` (suffix stripped via regex `\.nakama-\d+$`) for UI only. Do NOT assume `.nakama-0` is the only suffix.
4. **Bot detection (cross-validated)**:
   - `user_id` format: UUID regex = human, numeric = bot (ground truth)
   - Event type: `BotPosition/BotKill/BotKilled` = bot events
   - Log any mismatches between the two signals
5. **Timestamp normalization**: Convert `ts` (epoch-offset datetime) to total seconds, then subtract per-match minimum → `relative_time` (0 to match_duration). Playback slider will show `0:00` to `duration`.
6. **Coordinate pre-computation** (vectorized per map):
   ```
   u = (x - origin_x) / scale
   v = (z - origin_z) / scale
   pixel_x = u * 1024
   pixel_y = (1 - v) * 1024
   ```
   - Map configs: AmbroseValley (900, -370, -473), GrandRift (581, -290, -290), Lockdown (1000, -500, -500)
   - Clamp to [0, 1024], log count + percentage of out-of-bounds points
7. **Match reconstruction**: Group all files by `match_id` → join into unified match timelines
8. **Schema validation per row**: Assert non-null match_id, map_id, valid coordinate values
9. **Serialization**: Read each parquet with `pyarrow.parquet.read_table()`, convert to pandas for transformation. After grouping by match_id and nesting players with events, build Python dicts manually and write with `json.dump(match_dict, f, separators=(',', ':'))` for compact output. No `pandas.to_json()` — manual dict construction gives full control over the output schema.

### First-class Pipeline Validation:

The pipeline MUST produce `scripts/pipeline_report.json` (dev artifact — NOT in `public/`):
- Per-file log: filename, row count, match_id, events written
- Total verification: `sum(parquet rows) == sum(json events)` — **hard fail if mismatch**
- Event audit: count per event type, flag any unknown events
- Coordinate bounds: count/percentage outside [0, 1024]
- Bot detection mismatches: count and sample rows
- Exit non-zero on any validation failure

### Post-write Verification:

After all JSON files are written, **re-read each match JSON**, count total events across all files, assert it matches the parquet source total. Catches partial writes, encoding errors, disk-full scenarios. Hard fail if mismatch.

### Output Structure:

**`public/data/index.json`** — match index for filtering:
```json
{
  "AmbroseValley": {
    "2026-02-10": [
      { "match_id": "b71aaad8-...", "display_id": "b71aa...",
        "player_count": 3, "bot_count": 12,
        "kill_count": 8, "duration_seconds": 342.5 }
    ]
  }
}
```

**`public/data/matches/{match_id}.json`** — per-match files with pre-computed stats:
```json
{
  "match_id": "...", "map_id": "AmbroseValley", "duration_seconds": 342.5,
  "stats": {
    "total_kills": 5, "total_deaths": 3, "storm_deaths": 1,
    "loot_pickups": 12, "player_count": 3, "bot_count": 8
  },
  "players": [
    {
      "user_id": "f4e0...", "is_bot": false,
      "events": [
        { "type": "Position", "px": 78.0, "py": 890.0, "elevation": 124.9, "t": 0.0 }
      ]
    }
  ]
}
```

**`public/data/heatmaps/{map}_{type}.json`** — pre-computed density grids with **per-type resolution**:
- **Traffic**: 64x64 grid (tens of thousands of position events — good density)
- **Kills**: 24x24 grid with Gaussian smoothing (only ~2-4K kill events per map — sparser data needs larger cells + smoothing kernel)
- **Deaths**: 24x24 grid with Gaussian smoothing (similar sparsity to kills)
- Grid-binned, Gaussian blur (sigma=0.8–1.0, tune during implementation) applied to kill/death grids, normalized to 0-1 range
- 3 maps x 3 types = 9 files

**Minimap handling** (programmatic, not hardcoded):
- README formula outputs to a 1024x1024 coordinate space
- Script checks each image's actual dimensions at runtime:
  ```python
  img = Image.open(path)
  if img.size != (1024, 1024):
      if img.width != img.height:  # pad to square first
          size = max(img.width, img.height)
          padded = Image.new(img.mode, (size, size), (0, 0, 0, 0))
          padded.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
          img = padded
      img = img.resize((1024, 1024), Image.LANCZOS)
  ```
- Output as optimized PNG to `public/minimaps/`
- If already 1024x1024, copy as-is

---

## Phase 2: Frontend (`src/`)

### Layout (CSS Grid, dark theme)

```
+-------------------+------------------------------------------+
|                   |                                          |
|  FilterPanel      |        MapCanvas (with zoom/pan)         |
|  (280px sidebar)  |        + Legend overlay (bottom-left)     |
|                   |        + EventTooltip (on click)          |
|  MatchList        |                                          |
|  (scrollable)     |                                          |
|                   |                                          |
|  PlayerList       |        MatchStats bar (top of map area)  |
|  (when match      |                                          |
|   loaded)         |                                          |
+-------------------+------------------------------------------+
|  Heatmap toggles  |  Timeline / Playback Controls             |
+-------------------+------------------------------------------+
```

Dark theme: minimap images have light/neutral backgrounds — add subtle border/shadow around the canvas container to avoid jarring contrast.

### Default/Landing State:

On first load: auto-select AmbroseValley (most played map) + Feb 10 (most data). Show the match list immediately. Display a prompt on the canvas area: "Select a match from the sidebar to begin." No empty/blank state.

### Components:

**`FilterPanel.jsx`** — Map selector (3 toggle buttons), date picker (5 date buttons, Feb 14 marked "partial"), show/hide bots toggle

**`MatchList.jsx`** — Scrollable match cards from `index.json`, sorted by player_count descending. Each card: truncated display_id, player count, bot count, kill count, duration.

**`MapCanvas.jsx`** — Core renderer with **zoom/pan**:

Zoom/pan implementation:
- **Scroll-to-zoom**: `wheel` event adjusts zoom level (1x to `MAX_ZOOM` constant, default 8x — easy to adjust if building-level detail needs more), centered on cursor position
- **Drag-to-pan**: `mousedown` + `mousemove` for panning when zoomed
- Canvas transform: track `{ zoom, offsetX, offsetY }` state, apply `ctx.setTransform()` before all drawing
- All hit-testing (click-to-inspect) must account for the current transform

Rendering pipeline per frame:
1. Apply zoom/pan transform
2. Draw minimap background
3. Draw heatmap overlay (if active)
4. For each player (skip bots if hidden):
   - Draw movement trail as polyline (human=solid 2px colored, bot=dashed 1px gray)
   - Draw event markers (only events where `t <= currentTime`)
   - **Marker size scales with zoom** — stays readable at all zoom levels
   - **Markers render with transparency** so overlapping events in the same area are visible
   - Draw current position dot at latest visible position
5. If a player is highlighted, all others render at 15% opacity

**Event markers**:
| Event | Shape | Color |
|-------|-------|-------|
| Kill | Crosshair (+) | Red `#ff4444` |
| Killed | X mark | Red `#ff4444` |
| BotKill | Crosshair (+) | Orange `#ff8c00` |
| BotKilled | X mark | Orange `#ff8c00` |
| KilledByStorm | Diamond | Purple `#9b59b6` |
| Loot | Square | Green `#2ecc71` |

All markers rendered at 70% opacity so overlaps are visible.

**Player colors**: Humans get deterministic colors from a **16-color palette** (evenly-spaced HSL hues, saturation 70%, lightness 60%) hashed from user_id. No collisions up to 16 humans per match. Bots all get muted gray at 50% opacity.

**`colors.js`** — Central color module containing:
- `HUMAN_PALETTE`: 16 HSL-derived colors
- `EVENT_STYLES`: shape + color map for all 8 event types
- `getPlayerColor(userId, isBot, alpha)`: hash-based color assignment
- `heatmapGradient(value)`: 0-1 → rgba color (transparent → yellow → red)

**`MatchStats.jsx`** — Shown at top of map area when match loaded. Displays pre-computed stats from match JSON: total kills, deaths, storm deaths, loot pickups, player count, bot count, duration. No client-side re-counting needed.

**`Timeline.jsx`** — Play/pause button, speed toggle (1x/2x/4x), range slider (0 to match_duration), time display formatted as `M:SS`. Uses `requestAnimationFrame` with delta-time for smooth 60fps playback.

**`PlayerList.jsx`** — In sidebar when match loaded. Click to highlight. Shows player type, color swatch, event count.

**`Legend.jsx`** — Fixed bottom-left overlay on map. All marker shapes/colors + human/bot trail styles.

**`EventTooltip.jsx`** — Click event marker → tooltip: event type, player ID (truncated), human/bot, timestamp (formatted M:SS), elevation. Hit testing accounts for zoom transform, 10px radius in screen space.

**`HeatmapOverlay.jsx`** — Three toggle buttons. Renders density grid as semi-transparent rectangles. Color gradient: transparent → yellow → red.

### Key Hooks:

**`useMatchData.js`** — Loads `index.json` on mount, fetches per-match JSON on selection with **LRU cache (keep last 10 matches, evict oldest)**, fetches heatmap grids.

**`usePlayback.js`** — `requestAnimationFrame` loop, delta-time based. Returns `{ currentTime, isPlaying, speed, setCurrentTime, togglePlay, setSpeed }`.

---

## Phase 3: Polish & Deploy

1. **Keyboard shortcuts** (big UX win for Level Designer power users):
   - `Space` = play/pause
   - `Left/Right arrow` = step back/forward 1 second (or to prev/next event)
   - `+/-` or scroll = zoom in/out
   - `Escape` = deselect player / close tooltip
   - `R` = reset zoom to fit
2. Loading states for data fetching
3. Empty state handling (matches with 0 kills, single-event matches)
4. Subtle border/shadow around canvas for dark theme contrast
5. `vercel --prod` deploy
6. Write `ARCHITECTURE.md` (1-page: tech stack choices, data flow, trade-offs, what I'd do differently)
   - Include under "what I'd do differently": cross-match player search (find all matches for player X)

---

## File Structure

```
LILA-Assignment/
├── scripts/
│   ├── process_data.py
│   ├── requirements.txt
│   └── pipeline_report.json  # Generated by pipeline (dev artifact, not deployed)
├── public/
│   ├── data/
│   │   ├── index.json
│   │   ├── matches/          # ~796 per-match JSON files
│   │   └── heatmaps/         # 9 grid files
│   └── minimaps/             # 3 images (resized to 1024x1024 if needed)
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── components/
│   │   ├── MapCanvas.jsx     # Canvas renderer with zoom/pan
│   │   ├── FilterPanel.jsx
│   │   ├── MatchList.jsx
│   │   ├── MatchStats.jsx    # Pre-computed match statistics bar
│   │   ├── Timeline.jsx
│   │   ├── HeatmapOverlay.jsx
│   │   ├── PlayerList.jsx
│   │   ├── Legend.jsx
│   │   └── EventTooltip.jsx
│   ├── hooks/
│   │   ├── useMatchData.js   # LRU cache (10 matches)
│   │   └── usePlayback.js
│   └── utils/
│       └── colors.js         # Palette, event styles, gradient fn
├── ARCHITECTURE.md
├── package.json
└── vite.config.js
```

---

## Edge Cases

- **GrandRift 2160x2158**: Pad to square before resize
- **Out-of-bounds coords**: Clamp to [0, 1024], log count in pipeline report
- **Single-event matches**: Show a dot, no path
- **Zero-duration matches**: Disable playback slider
- **743 single-player matches**: Sort by player_count desc
- **Event marker overlap**: Render markers at 70% opacity, scale size with zoom level
- **match_id suffix variants**: Don't assume `.nakama-0` only — keep full ID for grouping
- **Dark theme + light minimaps**: Subtle border/shadow around canvas container

---

## Priority Stack (if time gets tight)

1. **Must ship**: Pipeline with validation + post-write verification, canvas rendering with zoom/pan, match browsing, timeline playback
2. **Must ship**: Player highlighting, click-to-inspect, match stats bar
3. **Should ship**: Heatmaps, legend, keyboard shortcuts
4. **Can cut**: Loading skeletons, LRU cache eviction, edge case polish

---

## Verification Plan

1. **Pipeline validation**: `pipeline_report.json` passes — row counts match, no unknown events, coordinate bounds logged
2. **Coordinate accuracy**: Pick 3 events from README sample data, verify pixel positions land correctly on minimap
3. **Match reconstruction**: Pick a multi-player match, verify all players from separate parquet files appear in same match JSON
4. **Playback**: Load multi-player match, play through — paths draw progressively, slider shows `0:00` to `M:SS`
5. **Zoom/pan**: Zoom into a kill cluster, verify markers are readable and click-to-inspect works at zoom
6. **Heatmap sanity**: Kill heatmap on AmbroseValley should show hotspots at logical chokepoints
7. **Deployment**: Open Vercel URL in incognito browser, verify tool loads and is usable without local setup

---

## Implementation Order

1. `scripts/process_data.py` with full validation — get data pipeline working first (everything depends on it)
2. Vite + React scaffolding + layout shell + `colors.js`
3. Data loading + FilterPanel + MatchList (browsable match index)
4. MapCanvas with zoom/pan + static rendering (all events visible, no playback)
5. Timeline + playback animation
6. MatchStats bar + click-to-inspect + PlayerList highlighting
7. Heatmap overlay
8. Polish, deploy, write ARCHITECTURE.md

---
---

# DRAFT: ARCHITECTURE.md (extract to separate file during implementation)

## Why This Tool Exists

Level Designers at LILA Games have 5 days of raw telemetry data from LILA BLACK — player positions, kills, deaths, loot pickups, storm deaths — but no way to see what's actually happening on their maps. They need to answer questions like: Where do fights cluster? Which areas of the map get ignored? Where do players die to the storm? Is there a chokepoint that's too dominant?

This tool turns ~89,000 raw events into an interactive visual explorer that a Level Designer can open in their browser and immediately start using — no setup, no data science skills required.

## Product Decisions

**Heatmap-first, match-second.** Level Designers care about map-level patterns (where are the kill zones? which areas are dead?), not individual match IDs. The tool opens with aggregate heatmaps visible on the selected map. Individual match drill-down is available but secondary. This matches how Level Designers actually work — they look for systemic patterns, then investigate specific matches to understand why.

**Multi-match overlay.** Selecting a map + date shows aggregated event markers across all matches on that map for that date. This is more useful than forcing the user to pick one match at a time. Individual match playback is available when they need temporal detail.

**Human vs bot distinction is always visible.** Bots and humans behave differently — bot pathing is artificial and can mislead if mistaken for human behavior. Human trails are solid and colored; bot trails are dashed gray. Bots can be toggled off entirely.

**Zoom/pan is core, not optional.** A 1024px minimap rendered at ~700px in the browser is a thumbnail. Level Designers need to zoom into buildings, chokepoints, and specific fight locations. Scroll-to-zoom and drag-to-pan make this possible.

**Keyboard shortcuts for power users.** Space for play/pause, arrows for time stepping, Escape to deselect, R to reset view. Level Designers are power users — these shortcuts make the tool feel professional.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Data pipeline** | Python (pyarrow + pandas + numpy) | Parquet is a Python-native format. pyarrow reads it directly. pandas handles the grouping/transformation. numpy handles heatmap grid computation. |
| **Frontend** | React + Vite | Fast build times, component model fits the UI naturally (sidebar, canvas, timeline are independent components), widely supported. |
| **Rendering** | HTML5 Canvas (layered) | Canvas handles thousands of polyline segments + markers efficiently. SVG would choke on this data volume. deck.gl/WebGL is overkill for ~89K events. Layered offscreen canvases (static minimap + heatmap on one layer, dynamic trails on another) avoid redrawing static content every frame. |
| **Hosting** | Vercel (static) | Free tier, instant deploys, shareable URL. No backend means no server costs, no cold starts, no downtime. The entire dataset fits in ~4MB of JSON — well within static site limits. |
| **State management** | React Context + useReducer | The app has simple shared state (selected map, date, match, playback time, zoom). No need for Redux or external state libraries. |

## Data Flow

```
Raw parquet files (1,243 files, ~10MB)
    ↓ scripts/process_data.py
    ↓ [read → decode → validate → group by match → compute coords → compute heatmaps]
    ↓
Pre-processed JSON (~4MB total)
    ├── index.json (match metadata for filtering)
    ├── matches/{id}.json (per-match player events with pixel coords)
    └── heatmaps/{map}_{type}.json (pre-computed density grids)
    ↓ Deployed as static files on Vercel
    ↓
Browser loads index.json on startup
    → User selects map + date → match list filters
    → User selects match → fetch match JSON → render on canvas
    → Heatmap toggle → fetch heatmap grid JSON → overlay on canvas
```

## Key Technical Decisions

**Pre-processed JSON over DuckDB-WASM.** DuckDB-WASM could query parquet directly in-browser, eliminating the build-time pipeline. But it adds a ~2MB WASM bundle, more complex async loading, and the data is small/fixed — there's no need for ad-hoc querying. Pre-processed JSON loads instantly and has zero runtime dependencies.

**Coordinates mapped to 1024x1024 space.** The README provides a UV→pixel formula targeting 1024x1024. Rather than keeping original minimap dimensions (up to 9000x9000) and scaling coordinates to match, we use 1024 as the logical coordinate space and scale the minimap display to fit the canvas. This keeps the coordinate pipeline simple and the formula exactly as documented.

**Per-match JSON files (not one big file).** With ~796 matches, loading all match data upfront would be ~4MB. Per-match files mean we only load the ~5-50KB needed for the selected match. First interaction is fast.

**Heatmap grids pre-computed in Python.** Computing kernel density in the browser on every toggle would add latency and complexity. Since the data is static, pre-computing 9 small grid files (3 maps × 3 types) at build time is simpler and instant on load.

**Different heatmap resolutions per type.** Traffic data has tens of thousands of position events — 64×64 grid has good density. Kill/death data has only ~2-4K events per map — 24×24 grid with Gaussian smoothing avoids sparse, useless visualizations.

## What I'd Do Differently With More Time

1. **Cross-match player search** — track a specific playtester across all their matches. Currently requires manual match browsing.
2. **Extraction zone inference** — the game is an extraction shooter, but there's no explicit "extraction" event. Could infer extraction points from final positions of surviving players. Would be a strong product-thinking signal.
3. **Path simplification** — Douglas-Peucker algorithm in the pipeline to reduce position event density for smoother rendering at high zoom levels.
4. **Shareable URLs** — encode map/date/match selection in the URL hash so Level Designers can share specific views with each other.
5. **Date range selection** — combine multiple dates into one view instead of single-date filtering.
6. **WebGL rendering** — if the dataset grows 10x, Canvas will struggle. deck.gl or raw WebGL would be the next step.

---
---

# DRAFT: TRADEOFFS.md (extract to separate file during implementation)

## Tradeoff Decisions

### 1. Static Site vs Backend Server

**Chose: Static site (no backend)**

| | Static Site | Backend (FastAPI/Flask) |
|---|---|---|
| Hosting cost | Free (Vercel) | $5-10/mo (Railway/Render) |
| Cold starts | None | 10-30s on free tiers |
| Reliability | 100% uptime (CDN) | Depends on server health |
| Data flexibility | Fixed at build time | Could query dynamically |
| Complexity | Lower | Higher (API routes, CORS, deployment) |

**Why:** The dataset is fixed (5 days of historical data, not live). Total output is ~4MB JSON. There's no query that requires server-side computation. A backend adds deployment complexity, cost, and potential downtime for zero benefit. If the data were live-streaming or >100MB, a backend would be justified.

### 2. Pre-processed JSON vs DuckDB-WASM (in-browser parquet querying)

**Chose: Pre-processed JSON**

| | Pre-processed JSON | DuckDB-WASM |
|---|---|---|
| Bundle size impact | 0KB | ~2MB WASM |
| Load time | Instant (JSON.parse) | 1-3s WASM init |
| Query flexibility | Fixed structure | Full SQL |
| Pipeline complexity | Python script required | No build step |
| Runtime dependencies | Zero | DuckDB-WASM library |

**Why:** The dataset is small and the access patterns are known (filter by map/date, load one match, load heatmap grids). Pre-processed JSON matches these patterns exactly. DuckDB-WASM's flexibility is wasted when you already know every query you'll run. The 2MB bundle tax and WASM initialization latency hurt first-load experience for no real gain.

**When DuckDB-WASM would be better:** If the dataset were 50MB+, if queries were unpredictable (ad-hoc analysis), or if we needed to avoid a build step entirely.

### 3. HTML5 Canvas vs SVG vs deck.gl (WebGL)

**Chose: HTML5 Canvas with layered offscreen buffers**

| | Canvas | SVG | deck.gl (WebGL) |
|---|---|---|---|
| Max elements | ~100K shapes | ~5K DOM nodes | Millions |
| Zoom/pan | Manual transform | Built-in (CSS) | Built-in |
| Hit testing | Manual (coordinate math) | Free (DOM events) | Built-in |
| Bundle size | 0KB (native) | 0KB (native) | ~200KB |
| Learning curve | Medium | Low | High |
| Heatmaps | Canvas API (fast) | Requires plugin | Built-in |

**Why:** ~89K events with ~15K position segments per match is well within Canvas capacity but would overwhelm SVG's DOM. deck.gl is overkill — it shines at millions of data points, but adds bundle weight and API complexity for our scale. Canvas gives precise control over the coordinate mapping (critical for correctness) and native heatmap rendering.

**Layered approach:** Static content (minimap image + heatmap overlay) rendered to an offscreen canvas once, then composited as a single image. Dynamic content (player trails up to current time, event markers) drawn on top each frame. This avoids re-drawing the minimap (which is a 1024x1024 image decode) on every frame during playback.

### 4. Resize Minimaps to 1024x1024 vs Keep Original Dimensions

**Chose: Resize to 1024x1024**

| | Resize to 1024 | Keep originals (up to 9000x9000) |
|---|---|---|
| Image quality | Lossy (LANCZOS downscale) | Full quality |
| File size served | ~200-500KB each | 2.9MB-11MB each |
| Page load | Fast | 3-5s extra on slow connections |
| Coordinate mapping | Formula works as-is (u×1024) | Must scale u×img_width, v×img_height |
| Canvas memory | ~4MB per image | ~324MB for Lockdown (9000×9000×4) |

**Why:** Serving a 9000x9000 JPEG (11MB) to the browser is brutal for load times and canvas memory. A 1024x1024 image at LANCZOS quality is visually indistinguishable at the display sizes we'll use (~700-1000px). The coordinate formula from the README targets 1024x1024 — keeping this unchanged avoids introducing bugs. The quality loss is negligible; the performance gain is massive.

### 5. Per-Match JSON Files vs Single Monolithic File

**Chose: Per-match files (~796 files)**

| | Per-match files | Single file |
|---|---|---|
| Initial load | ~2KB (index.json) | ~4MB (everything) |
| Match switch | ~5-50KB fetch | Instant (already loaded) |
| Browser caching | Granular (per match) | All or nothing |
| CDN efficiency | Each file cached separately | One large cache entry |
| File count | ~800 files | 1 file |

**Why:** First-load experience matters. Loading 4MB of JSON before the user sees anything is unacceptable. Per-match files mean the index loads instantly (~2KB), the match list appears immediately, and only the selected match's data (~5-50KB) is fetched on demand. Browser caching means revisiting a match is instant. The tradeoff is more HTTP requests, but each is tiny and cacheable.

### 6. Heatmap Pre-computation vs Client-side Computation

**Chose: Pre-computed in Python pipeline**

**Why:** The data is static. Computing kernel density estimation in JavaScript on every heatmap toggle adds ~100-500ms of computation and requires porting the algorithm to JS. Pre-computing in Python (where numpy makes this trivial) produces 9 small JSON files (3 maps × 3 types) that load instantly. The tradeoff is less flexibility — you can't dynamically change the grid resolution or kernel size in the UI. But for a fixed dataset, this is the right call.

**Sigma tuning:** Kill/death heatmaps use Gaussian smoothing (sigma=0.8-1.0 on 24x24 grid). This will be tuned empirically after seeing the actual distribution. sigma is a parameter in the pipeline script so it's easy to adjust.

### 7. React + Vite vs Next.js vs Streamlit

**Chose: React + Vite**

| | React + Vite | Next.js | Streamlit |
|---|---|---|---|
| Build speed | ~1s | ~3-5s | N/A (runtime) |
| Bundle size | Minimal | Larger (SSR runtime) | N/A |
| SSR | No | Yes | N/A |
| Hosting | Any static host | Vercel (optimized) | Needs Python server |
| Dev experience | Fast HMR | Fast HMR | Auto-reload |
| Customization | Full control | Full control | Limited (widget-based) |

**Why:** We don't need SSR (it's a single-page tool, not a content site). Next.js adds routing, API routes, and SSR machinery we won't use. Streamlit would be fastest to build but produces widget-based UIs that can't deliver the custom Canvas rendering + zoom/pan + timeline playback experience we need. React + Vite is the sweet spot: fast development, full control, minimal overhead.

### 8. 16-Color HSL Palette vs Fewer Colors

**Chose: 16 evenly-spaced HSL colors**

**Why:** Matches can have 10+ human players. An 8-color palette guarantees collisions (two players sharing a color). 16 colors with evenly-spaced hues at consistent saturation/lightness are perceptually distinct and handle the maximum observed match size. Colors are assigned via a hash of user_id for consistency across views.

### 9. Browser Fetch Caching vs Application-level LRU Cache

**Chose: Browser fetch caching (Cache-Control headers)**

**Why:** Vercel serves static files with proper Cache-Control headers by default. The browser already handles caching efficiently — adding an application-level LRU cache duplicates this work and adds code complexity. If each match JSON is 20-50KB, even 50 cached matches is only ~2.5MB — trivial for browser memory. Let the browser handle it.

### 10. match_id: Keep Full vs Strip Suffix

**Chose: Keep full match_id for data integrity, strip suffix for display only**

**Why:** The match_id includes a `.nakama-X` suffix indicating the game server instance. Stripping this for grouping is dangerous — what if two matches share the same UUID but ran on different server instances? Unlikely, but the cost of keeping the full ID is zero, and it eliminates a class of potential bugs. The UI shows a cleaned `display_id` (suffix stripped, first 8 chars) for readability.

---
---

# DRAFT: TEST_CASES.md (extract to separate file during implementation)

## Test Cases

### A. Data Pipeline Tests

#### A1. Parquet File Reading
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A1.1 | Read valid human player file | `f4e072fa-..._b71aaad8-....nakama-0` | DataFrame with columns: user_id, match_id, map_id, x, y, z, ts, event | P0 |
| A1.2 | Read valid bot file | `1440_d7e50fad-....nakama-0` | DataFrame with same schema, user_id = "1440" | P0 |
| A1.3 | Handle corrupt/unreadable parquet file | Truncated or invalid file | Log error with filename, skip file, do NOT silently ignore — report in pipeline_report.json | P0 |
| A1.4 | Handle empty directory | A February_XX folder with no files | Produce empty match list for that date, no crash | P1 |
| A1.5 | Read all 1,243 files without error | All 5 day folders | Total rows ≈ 89,000 (± tolerance), no exceptions | P0 |

#### A2. Event Decoding
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A2.1 | Decode bytes event to string | `b'Position'` | `"Position"` | P0 |
| A2.2 | Decode all 8 known event types | All event values in dataset | Each decodes to one of: Position, BotPosition, Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot | P0 |
| A2.3 | Flag unknown event type | A hypothetical `b'Respawn'` | Logged as unknown in pipeline_report.json, not silently dropped | P0 |
| A2.4 | Handle already-decoded string event | `"Position"` (not bytes) | Pass through unchanged | P1 |

#### A3. Bot Detection
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A3.1 | UUID user_id → human | `f4e072fa-b7af-4761-b567-1d95b7ad0108` | `is_bot = false` | P0 |
| A3.2 | Numeric user_id → bot | `1440` | `is_bot = true` | P0 |
| A3.3 | Cross-validate: human user_id + Position event | UUID + "Position" | Both signals agree → human | P0 |
| A3.4 | Cross-validate: bot user_id + BotPosition event | Numeric + "BotPosition" | Both signals agree → bot | P0 |
| A3.5 | Mismatch: bot user_id + human event type | Numeric user_id + "Kill" | Log mismatch in report, use user_id as ground truth (is_bot = true) | P1 |

#### A4. Timestamp Normalization
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A4.1 | Convert epoch-offset ts to relative time | Match with ts values `1970-01-21 11:52:07.161` and `1970-01-21 11:55:07.161` | relative_time = 0.0 and 180.0 (seconds) | P0 |
| A4.2 | All events in a match share reasonable time window | All events for one match_id | max(relative_time) < 1800 seconds (30 min) — flag if not | P0 |
| A4.3 | Single-event match | Match with 1 event | relative_time = 0.0, duration = 0.0 | P1 |
| A4.4 | Consistent ordering | Events sorted by ts within a player | relative_time is monotonically non-decreasing | P0 |

#### A5. Coordinate Mapping
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A5.1 | README sample: AmbroseValley | x=-301.45, z=-355.55 (scale=900, origin=(-370,-473)) | pixel_x ≈ 78, pixel_y ≈ 890 | P0 |
| A5.2 | Origin point maps to (0, 1024) | x=origin_x, z=origin_z for any map | pixel_x=0, pixel_y=1024 | P0 |
| A5.3 | Far corner maps to (1024, 0) | x=origin_x+scale, z=origin_z+scale | pixel_x=1024, pixel_y=0 | P0 |
| A5.4 | Out-of-bounds coordinate clamped | x far outside map bounds | pixel_x clamped to [0, 1024], logged in report | P0 |
| A5.5 | GrandRift coordinates | Sample GrandRift event | Maps correctly with scale=581, origin=(-290,-290) | P0 |
| A5.6 | Lockdown coordinates | Sample Lockdown event | Maps correctly with scale=1000, origin=(-500,-500) | P0 |
| A5.7 | Y column is elevation, not used for 2D | Any event | `y` stored as `elevation` in output, NOT used for pixel_x/pixel_y | P0 |

#### A6. Match Reconstruction
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A6.1 | Multiple files with same match_id merge | 3 parquet files sharing match_id X | Single match JSON with 3 players, all events present | P0 |
| A6.2 | match_id suffix preserved for grouping | Files with `.nakama-0` suffix | All files with same full match_id grouped together | P0 |
| A6.3 | display_id strips suffix | `b71aaad8-...nakama-0` | display_id = `b71aaad8` (first 8 chars of UUID portion) | P1 |
| A6.4 | Events sorted by relative_time per player | Unsorted input | Output events ordered by `t` ascending within each player | P0 |

#### A7. Output Validation
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A7.1 | Row count integrity | All parquet files | `sum(all parquet rows) == sum(all events across all match JSONs)` — hard fail if not | P0 |
| A7.2 | Post-write verification | Written match JSON files | Re-read all JSON files, re-count events, assert matches source total | P0 |
| A7.3 | index.json completeness | All processed matches | Every match_id in the data appears exactly once in index.json | P0 |
| A7.4 | Match JSON schema validity | Any match JSON file | Has keys: match_id, map_id, duration_seconds, stats, players. Each player has user_id, is_bot, events. Each event has type, px, py, elevation, t. | P0 |
| A7.5 | Compact JSON output | Written JSON files | No pretty-printing, uses `separators=(',', ':')` | P2 |
| A7.6 | pipeline_report.json written to scripts/ (not public/) | Pipeline run | File exists at `scripts/pipeline_report.json`, NOT `public/data/pipeline_report.json` | P0 |

#### A8. Heatmap Generation
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A8.1 | Traffic heatmap: 64x64 grid | All Position+BotPosition events for AmbroseValley | 64x64 array, values normalized 0-1, non-zero cells exist | P0 |
| A8.2 | Kill heatmap: 24x24 grid with smoothing | All Kill+BotKill events for AmbroseValley | 24x24 array, Gaussian smoothed (sigma=0.8-1.0), normalized 0-1 | P0 |
| A8.3 | Death heatmap: 24x24 grid | All Killed+BotKilled+KilledByStorm events | 24x24 array, smoothed and normalized | P0 |
| A8.4 | Map with no kills | Hypothetical map with only Position events | Kill heatmap is all zeros, no crash | P1 |
| A8.5 | 9 heatmap files generated | 3 maps × 3 types | 9 JSON files in `public/data/heatmaps/` | P0 |

#### A9. Minimap Processing
| # | Test Case | Input | Expected | Priority |
|---|-----------|-------|----------|----------|
| A9.1 | Already 1024x1024 | Hypothetical 1024x1024 image | Copied as-is, no resize | P1 |
| A9.2 | Non-square image (GrandRift 2160x2158) | 2160x2158 PNG | Padded to 2160x2160, then resized to 1024x1024 | P0 |
| A9.3 | Large square image (Lockdown 9000x9000) | 9000x9000 JPG | Resized to 1024x1024 via LANCZOS | P0 |
| A9.4 | Output format | Any input image | Output as PNG in `public/minimaps/` | P0 |

---

### B. Frontend Tests

#### B1. Data Loading
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B1.1 | Index loads on startup | Open the app | index.json fetched, map selector + date picker populated | P0 |
| B1.2 | Match list populates | Select AmbroseValley + Feb 10 | Match cards appear, sorted by player_count descending | P0 |
| B1.3 | Match data loads on click | Click a match card | Match JSON fetched, canvas renders player trails | P0 |
| B1.4 | Heatmap loads on toggle | Click "Kills" heatmap button | Heatmap grid JSON fetched, overlay appears on canvas | P0 |
| B1.5 | Failed fetch shows error | Network error or 404 | Error message displayed, app doesn't crash | P1 |

#### B2. Filtering
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B2.1 | Map filter changes match list | Switch from AmbroseValley to GrandRift | Match list updates to show only GrandRift matches | P0 |
| B2.2 | Date filter changes match list | Switch from Feb 10 to Feb 11 | Match list updates to show only Feb 11 matches | P0 |
| B2.3 | Feb 14 labeled as partial | View date selector | Feb 14 button shows "(partial)" label | P2 |
| B2.4 | Bot toggle hides bot trails | Uncheck "Show bots" | Bot trails and BotPosition/BotKill/BotKilled markers disappear from canvas | P0 |
| B2.5 | Changing map clears selected match | Select a match on AmbroseValley, then switch to GrandRift | Canvas clears, no stale data shown | P0 |

#### B3. Canvas Rendering
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B3.1 | Minimap displays correctly | Select a map | Minimap image fills the canvas area, no distortion | P0 |
| B3.2 | Human trail renders as solid colored line | Load match with human players | Solid polyline in a distinct color, 2px width | P0 |
| B3.3 | Bot trail renders as dashed gray line | Load match with bots, bots visible | Dashed gray polyline, 1px width | P0 |
| B3.4 | Kill marker: red crosshair | Load match with Kill event | Red (+) shape at correct position | P0 |
| B3.5 | Killed marker: red X | Load match with Killed event | Red (×) shape at correct position | P0 |
| B3.6 | KilledByStorm marker: purple diamond | Load match with KilledByStorm event | Purple filled diamond at correct position | P0 |
| B3.7 | Loot marker: green square | Load match with Loot event | Green filled square at correct position | P0 |
| B3.8 | BotKill marker: orange crosshair | Load match with BotKill event | Orange (+) at correct position | P0 |
| B3.9 | Markers render at 70% opacity | Multiple markers in same area | Overlapping markers are visible through each other | P1 |
| B3.10 | Player colors are deterministic | Load same match twice | Same player gets same color both times | P1 |
| B3.11 | No two adjacent human players share color | Match with 5+ humans | Each human has a visually distinct color from the 16-color palette | P1 |

#### B4. Zoom & Pan
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B4.1 | Scroll-to-zoom in | Scroll up on canvas | Map zooms in centered on cursor position | P0 |
| B4.2 | Scroll-to-zoom out | Scroll down on canvas | Map zooms out, minimum 1x (no zoom below fit) | P0 |
| B4.3 | Zoom cap | Scroll in extensively | Zoom stops at MAX_ZOOM constant (default 8x) | P0 |
| B4.4 | Drag-to-pan | Click and drag on zoomed canvas | Map pans following cursor | P0 |
| B4.5 | Pan bounds | Pan while zoomed | Cannot pan beyond minimap edges | P1 |
| B4.6 | Markers scale with zoom | Zoom to 4x | Event markers remain readable (size adjusts inversely to zoom) | P0 |
| B4.7 | Click-to-inspect works at zoom | Zoom to 4x, click a marker | Tooltip appears for the correct event | P0 |
| B4.8 | Reset zoom (R key) | Press R while zoomed | Canvas resets to 1x zoom, centered | P1 |

#### B5. Timeline & Playback
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B5.1 | Slider range matches match duration | Load a match | Slider min=0, max=match duration in seconds | P0 |
| B5.2 | Play button starts animation | Click play | Trails draw progressively, current time advances | P0 |
| B5.3 | Pause button stops animation | Click pause during playback | Animation freezes at current time | P0 |
| B5.4 | Speed toggle cycles 1x → 2x → 4x | Click speed button 3 times | Speed label changes: 1x, 2x, 4x, back to 1x | P0 |
| B5.5 | Slider drag seeks to time | Drag slider to midpoint | Canvas shows events up to that time, future events hidden | P0 |
| B5.6 | Time display format | During playback | Shows `M:SS` format (e.g., `2:45`), not raw seconds | P0 |
| B5.7 | Playback reaches end | Play through full match | Playback stops at match end, play button resets | P0 |
| B5.8 | Zero-duration match | Load match with duration 0 | Slider disabled, all events shown statically | P1 |
| B5.9 | Current position indicator | During playback | Each player shows a dot at their latest visible position | P0 |

#### B6. Player Highlighting
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B6.1 | Click player in sidebar | Click a human player in PlayerList | That player's trail is full opacity, all others dim to 15% | P0 |
| B6.2 | Click same player again deselects | Click highlighted player again | All players return to full opacity | P0 |
| B6.3 | Player list shows color swatch | Load a match | Each player entry has a color indicator matching their trail | P1 |
| B6.4 | Player list distinguishes human/bot | Load a match | Humans and bots visually differentiated (label or icon) | P1 |

#### B7. Click-to-Inspect (EventTooltip)
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B7.1 | Click event marker shows tooltip | Click a Kill marker | Tooltip appears near marker showing: event type, player ID, timestamp, elevation | P0 |
| B7.2 | Click empty area closes tooltip | Click on empty map area | Tooltip disappears | P0 |
| B7.3 | Tooltip shows correct data | Click a known event | All tooltip fields match the event data in the JSON | P0 |
| B7.4 | Tooltip at canvas edge doesn't overflow | Click marker near canvas border | Tooltip repositions to stay within visible area | P1 |
| B7.5 | Hit radius is 10px in screen space | Click 8px from a marker | Marker is selected (within radius) | P1 |
| B7.6 | Nearest marker wins on overlap | Click between two close markers | Tooltip shows the closer one | P1 |

#### B8. Heatmap Overlay
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B8.1 | Kill heatmap toggle | Click "Kills" button | Semi-transparent heat overlay appears on canvas | P0 |
| B8.2 | Toggle off | Click active heatmap button again | Overlay disappears | P0 |
| B8.3 | Switch heatmap type | Switch from "Kills" to "Traffic" | Previous overlay replaced with new one | P0 |
| B8.4 | Color gradient | View heatmap | Low density = transparent/yellow, high density = red | P0 |
| B8.5 | Heatmap respects zoom | Zoom to 4x with heatmap active | Heatmap grid zooms correctly with map | P0 |

#### B9. Match Stats
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B9.1 | Stats bar appears when match loaded | Select a match | Stats bar shows: kills, deaths, storm deaths, loot, players, bots, duration | P0 |
| B9.2 | Stats match pre-computed values | Compare stats bar with JSON stats | All numbers match exactly — no client-side recounting | P0 |
| B9.3 | Stats clear when match deselected | Change map or date | Stats bar clears or hides | P1 |

#### B10. Keyboard Shortcuts
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B10.1 | Space toggles play/pause | Press Space with match loaded | Playback starts/stops | P1 |
| B10.2 | Left arrow steps back 1s | Press Left during playback | currentTime decreases by 1 second (min 0) | P1 |
| B10.3 | Right arrow steps forward 1s | Press Right during playback | currentTime increases by 1 second (max duration) | P1 |
| B10.4 | Escape deselects | Press Escape with player highlighted | Player deselected, tooltip closed | P1 |
| B10.5 | R resets zoom | Press R while zoomed | Zoom resets to 1x, centered | P1 |
| B10.6 | Shortcuts don't fire in text inputs | Focus on a search input, press Space | No playback toggle — only space typed in input | P2 |

#### B11. Legend
| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| B11.1 | Legend visible when match loaded | Load any match | Legend overlay shows all 6 event marker types with correct shapes/colors + human/bot trail styles | P0 |
| B11.2 | Legend doesn't obstruct map interaction | Click through legend area | Clicks pass through to canvas (or legend is positioned to not block key areas) | P2 |

---

### C. Integration / End-to-End Tests

| # | Test Case | Action | Expected | Priority |
|---|-----------|--------|----------|----------|
| C1 | Full pipeline → frontend flow | Run pipeline, start dev server, open browser | App loads, index populated, matches browsable | P0 |
| C2 | Coordinate accuracy spot-check | Load AmbroseValley match, find event at x=-301.45 z=-355.55 | Marker appears at pixel (78, 890) on minimap — visually in the correct map location | P0 |
| C3 | Multi-player match reconstruction | Pick a match_id with known 5+ players in parquet | All players appear in the match JSON and render on canvas with distinct colors | P0 |
| C4 | Full playback of a match | Select multi-player match, press Play, watch to completion | All trails draw progressively, events appear at correct times, playback stops at end | P0 |
| C5 | Deployment test | Open Vercel URL in incognito browser | Tool loads fully, no console errors, all features work without local setup | P0 |
| C6 | All 3 maps render correctly | Switch between AmbroseValley, GrandRift, Lockdown | Each map's minimap loads, coordinates map correctly, heatmaps load | P0 |
| C7 | Browser compatibility | Open in Chrome + Safari (or Firefox) | No rendering differences, all features work | P1 |

---

### D. Data Integrity Checks (run once after pipeline)

| # | Check | Command/Method | Pass Criteria |
|---|-------|---------------|---------------|
| D1 | Total event count | `sum(events in all match JSONs)` | Equals total parquet rows (from pipeline_report.json) |
| D2 | All 8 event types present | Count distinct event types in output | Exactly 8 types, no unknowns |
| D3 | All 3 maps present | Distinct map_ids in index.json | AmbroseValley, GrandRift, Lockdown |
| D4 | All 5 dates present | Date keys in index.json | 2026-02-10 through 2026-02-14 |
| D5 | No null coordinates | Check all px/py values | All are finite numbers in [0, 1024] |
| D6 | No negative relative_time | Check all t values | All ≥ 0.0 |
| D7 | Match count | Count match JSON files | ≈ 796 (per README) |
| D8 | Heatmap file count | Count files in heatmaps/ | Exactly 9 |
| D9 | Minimap file count | Count files in minimaps/ | Exactly 3 |
