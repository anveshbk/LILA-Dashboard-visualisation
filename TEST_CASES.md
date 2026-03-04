# Test Cases — LILA BLACK Player Journey Visualizer

Manual test cases for verifying the tool's functionality. Organized by feature area.

---

## 1. Data Pipeline Verification

### TC-1.1: Event count integrity
- **Steps**: Run `python scripts/process_data.py`, check console output
- **Expected**: "Verification passed: 89104 events match across parquet → JSON → re-read"
- **Validates**: Zero data loss from parquet to JSON

### TC-1.2: Match count per map
- **Steps**: Open `public/data/index.json`, count entries per map
- **Expected**:
  - AmbroseValley: 566 matches (200 on Feb 10)
  - GrandRift: 59 matches (24 on Feb 10)
  - Lockdown: 171 matches (61 on Feb 10)
  - Total: 796 matches
- **Validates**: All parquet files processed, no matches dropped

### TC-1.2b: Per-day event count cross-verification
- **Steps**: Sum all events across match JSONs grouped by date, compare to parquet source
- **Expected**:
  | Day | Parquet Rows | JSON Events | Status |
  |---|---|---|---|
  | Feb 10 | 33,687 | 33,958 | Per-day differs (midnight-span matches), total OK |
  | Feb 11 | 21,235 | 20,964 | Per-day differs (midnight-span matches), total OK |
  | Feb 12 | 18,429 | 18,429 | Exact match |
  | Feb 13 | 11,106 | 11,106 | Exact match |
  | Feb 14 | 4,647 | 4,647 | Exact match |
  | **Total** | **89,104** | **89,104** | **Exact match** |
- **Validates**: Zero data loss end-to-end. Per-day variance on Feb 10/11 is expected because some matches span midnight and the pipeline groups by match timestamp, not source folder

### TC-1.3: Coordinate bounds check
- **Steps**: Check pipeline report (`scripts/pipeline_report.json`) for out-of-bounds percentage
- **Expected**: 0% out-of-bounds coordinates (all px, py within 0-1024)
- **Validates**: World-to-pixel conversion is correct for all 3 map configs

### TC-1.4: Heatmap file generation
- **Steps**: Check `public/data/heatmaps/` directory
- **Expected**: 15 files — 3 maps × 5 types (traffic, kills, deaths, loot, storm_deaths)
- **Validates**: All heatmap types generated for all maps

### TC-1.5: Bot detection consistency
- **Steps**: Check pipeline report for bot validation stats
- **Expected**: Bot detection by user_id format matches expected behavior (UUIDs = human, numeric = bot)
- **Validates**: Bot flag is reliable for filtering

---

## 2. Map Selection & Navigation

### TC-2.1: Map switch loads correct data
- **Steps**: Click each map button (Ambrose Valley, Grand Rift, Lockdown)
- **Expected**: Minimap image changes, match count in dropdown updates, stats bar shows correct map name
- **Validates**: Map filter works, correct data loaded

### TC-2.2: Date switch updates match list
- **Steps**: Select Ambrose Valley, click through Feb 10-14
- **Expected**: Match counts change (200, 137, 127, 78, 24)
- **Validates**: Date filter correctly narrows matches

### TC-2.3: Map/date change resets selections
- **Steps**: Select a match, then select a player, then change the map
- **Expected**: Match dropdown resets to "All Matches", player dropdown resets to "All Players"
- **Validates**: Cascading filter reset works

---

## 3. Match & Player Selection

### TC-3.1: All Matches mode
- **Steps**: Leave match dropdown as "All Matches" on Ambrose Valley, Feb 10
- **Expected**: All 200 matches' trails visible on map, stats bar shows aggregate counts
- **Validates**: Multi-match merge works

### TC-3.2: Single match selection
- **Steps**: Select a specific match from dropdown
- **Expected**: Only that match's trails/markers visible, stats bar updates, player dropdown populates with that match's players
- **Validates**: Single match loading and display

### TC-3.3: Player selection shows single trail
- **Steps**: Select a match, then select a human player
- **Expected**: Only that player's trail visible with colored line, event list panel appears in sidebar
- **Validates**: Player filter isolates single trail

### TC-3.4: Searchable dropdown - match search
- **Steps**: Click match dropdown, type part of a match ID in the search input
- **Expected**: Dropdown filters to show only matching entries, full match ID visible (no truncation)
- **Validates**: Search functionality, full ID display

### TC-3.5: Searchable dropdown - player search
- **Steps**: Select a match, click player dropdown, type part of a player ID
- **Expected**: Dropdown filters matching players, bot players shown with [BOT] prefix
- **Validates**: Player search works, bot labeling correct

---

## 4. Match Count Filter

### TC-4.1: Add a kills filter
- **Steps**: Click "+ Add filter", set Event=Kills, Operator=>=, Count=3
- **Expected**: Match dropdown count decreases, only matches with 3+ kills remain
- **Validates**: Filter correctly narrows match list

### TC-4.2: Multiple stacked filters
- **Steps**: Add "Kills >= 3" AND "Loot > 5"
- **Expected**: Only matches satisfying BOTH conditions shown
- **Validates**: AND logic for multiple filters

### TC-4.3: Remove a filter
- **Steps**: Click × on a filter row
- **Expected**: That filter removed, match list re-expands
- **Validates**: Filter removal works

### TC-4.4: Filter with no results
- **Steps**: Set "Kills >= 999"
- **Expected**: Match dropdown shows "All Matches (0)", map clears
- **Validates**: Graceful handling of empty filter results

### TC-4.5: Empty filter value ignored
- **Steps**: Add a filter but leave the count field empty
- **Expected**: No filtering applied (all matches shown)
- **Validates**: Non-numeric input is safely ignored

---

## 5. Canvas Rendering

### TC-5.1: Zoom in/out
- **Steps**: Scroll wheel up on the map
- **Expected**: Map zooms in centered on cursor position, trails and markers scale appropriately
- **Validates**: Zoom transform works

### TC-5.2: Pan
- **Steps**: Click and drag on the map
- **Expected**: Map pans smoothly, trails move with it
- **Validates**: Pan transform works

### TC-5.3: Reset zoom (R key)
- **Steps**: Zoom in, then press R
- **Expected**: Map returns to default 1x zoom, centered
- **Validates**: Reset zoom keyboard shortcut

### TC-5.4: Click event marker
- **Steps**: Click on a Kill marker (crosshair shape) on the map
- **Expected**: Tooltip appears showing event type, player ID, human/bot, time, coordinates
- **Validates**: Event click detection and tooltip display

### TC-5.5: Multi-player trail colors
- **Steps**: Select a match with 5+ human players, set "All Players"
- **Expected**: Each player has a distinct neon color trail, colors cycle through 10 presets
- **Validates**: Player color assignment

### TC-5.6: Bot trail rendering
- **Steps**: Enable "Show Bots", select a match with bots
- **Expected**: Bot trails shown as dashed gray lines, human trails as solid colored lines
- **Validates**: Bot vs human trail differentiation

---

## 6. Heatmap Overlays

### TC-6.1: Toggle heatmap types
- **Steps**: Click Traffic, then Kills, then Deaths, then Loot, then Storm Deaths
- **Expected**: Each shows a different colored overlay on the map, only one active at a time
- **Validates**: Radio-style heatmap selection

### TC-6.2: Heatmap off
- **Steps**: Click an active heatmap button again
- **Expected**: Heatmap overlay disappears
- **Validates**: Toggle off works

### TC-6.3: Trail toggle independent of heatmap
- **Steps**: Enable a heatmap, then uncheck "Trails"
- **Expected**: Heatmap remains visible, trails disappear
- **Validates**: Trail and heatmap toggles are independent

---

## 7. Event Type Filters

### TC-7.1: Uncheck Kill events
- **Steps**: Uncheck "Kill (PvP)" in Event Types section
- **Expected**: Kill crosshair markers disappear from map, Kill events disappear from event list (if player selected)
- **Validates**: Event type filter hides markers on map and in sidebar

### TC-7.2: Uncheck all events
- **Steps**: Uncheck all 6 event type checkboxes
- **Expected**: No event markers on map, event list shows "No events match current filters"
- **Validates**: All-unchecked state handled gracefully

### TC-7.3: Re-enable events
- **Steps**: Uncheck Loot, then re-check it
- **Expected**: Loot markers reappear on map
- **Validates**: Toggle back on works

---

## 8. Event List & Victim Correlation

### TC-8.1: Event list appears for selected player
- **Steps**: Select a match, select a human player who has kill/death events
- **Expected**: Event list panel appears in sidebar showing Kill, Death, Loot events (no Position events)
- **Validates**: Event list filters correctly

### TC-8.2: Hover highlights on map
- **Steps**: Hover over an event in the sidebar list
- **Expected**: Corresponding marker on map highlights (larger size + white pulsing ring)
- **Validates**: Hover-to-highlight sync between list and map

### TC-8.3: Kill victim shown
- **Steps**: Find a Kill event in the event list
- **Expected**: Shows "Kill (PvP) → [victim_id]" with the killed player's ID
- **Validates**: Kill victim correlation by timestamp + proximity

### TC-8.4: Event list respects type filter
- **Steps**: Select a player, then uncheck "Loot" in event types
- **Expected**: Loot events disappear from the event list
- **Validates**: Event type filter applies to sidebar list

---

## 9. Playback

### TC-9.1: Play/pause button
- **Steps**: Click the play button (▶)
- **Expected**: Events animate over time, timeline scrubber moves, button changes to pause (⏸)
- **Validates**: Playback starts and stops

### TC-9.2: Speed control
- **Steps**: Click the speed button multiple times
- **Expected**: Cycles through 1x → 2x → 4x → 1x
- **Validates**: Speed multiplier works

### TC-9.3: Timeline scrubber
- **Steps**: Drag the timeline slider to different positions
- **Expected**: Map shows events up to that timestamp, events beyond are hidden
- **Validates**: Manual time control

---

## 10. Theme

### TC-10.1: Dark/light toggle
- **Steps**: Click the sun/moon icon in top-right corner
- **Expected**: UI switches between dark and light theme, colors update everywhere
- **Validates**: Theme toggle works

### TC-10.2: Theme persistence
- **Steps**: Switch to light theme, reload the page
- **Expected**: Light theme is remembered (stored in localStorage)
- **Validates**: Theme persists across sessions

---

## 11. Stats Bar

### TC-11.1: Aggregate stats
- **Steps**: Select "All Matches" on Ambrose Valley, Feb 10
- **Expected**: Stats bar shows total players, bots, kills, deaths, storm deaths, loot across all 200 matches
- **Validates**: Aggregate stats computed correctly

### TC-11.2: Player-level stats
- **Steps**: Select a specific match, then select a player
- **Expected**: Stats bar shows only that player's kill/death/loot counts
- **Validates**: Stats filter down to player level

---

## 12. Edge Cases

### TC-12.1: Match with 0 kills
- **Steps**: Find a match with kill_count=0 (use filter: kills == 0)
- **Expected**: No kill markers on map, stats show 0 kills
- **Validates**: Zero-event matches handled correctly

### TC-12.2: Feb 14 partial day
- **Steps**: Select any map, click Feb 14
- **Expected**: Fewer matches shown (24/8/5), data loads correctly
- **Validates**: Partial day data works

### TC-12.3: Escape key deselects
- **Steps**: Select a player, press Escape
- **Expected**: Player deselected, event list disappears, all players' trails visible again
- **Validates**: Escape keyboard shortcut

### TC-12.4: Rapid filter changes
- **Steps**: Quickly click through different maps and dates
- **Expected**: UI stays responsive, no stale data displayed, no console errors
- **Validates**: State management handles rapid changes
