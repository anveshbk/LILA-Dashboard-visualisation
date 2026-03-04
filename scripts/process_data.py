#!/usr/bin/env python3
"""
LILA BLACK — Data Pipeline
Reads parquet telemetry files → outputs structured JSON for the visualization frontend.
"""

import os
import re
import json
import sys
import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from PIL import Image
from scipy.ndimage import gaussian_filter

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATA_ROOT = Path(__file__).resolve().parent.parent / "player_data"
OUTPUT_ROOT = Path(__file__).resolve().parent.parent / "public"

DATE_MAP = {
    "February_10": "2026-02-10",
    "February_11": "2026-02-11",
    "February_12": "2026-02-12",
    "February_13": "2026-02-13",
    "February_14": "2026-02-14",
}

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

KNOWN_EVENTS = {
    "Position", "BotPosition", "Kill", "Killed",
    "BotKill", "BotKilled", "KilledByStorm", "Loot",
}

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
NAKAMA_SUFFIX_RE = re.compile(r"\.nakama-\d+$")

HEATMAP_CONFIG = {
    "traffic":      {"grid": 64, "sigma": 0, "events": {"Position", "BotPosition"}},
    "kills":        {"grid": 24, "sigma": 1.0, "events": {"Kill", "BotKill"}},
    "deaths":       {"grid": 24, "sigma": 1.0, "events": {"Killed", "BotKilled", "KilledByStorm"}},
    "loot":         {"grid": 32, "sigma": 0.8, "events": {"Loot"}},
    "storm_deaths": {"grid": 24, "sigma": 1.2, "events": {"KilledByStorm"}},
}

# ---------------------------------------------------------------------------
# Pipeline report accumulator
# ---------------------------------------------------------------------------

report = {
    "files_processed": 0,
    "files_skipped": [],
    "total_parquet_rows": 0,
    "total_json_events": 0,
    "event_counts": {},
    "unknown_events": [],
    "out_of_bounds": {"count": 0, "percentage": 0.0},
    "bot_detection_mismatches": [],
    "matches_written": 0,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_bot_by_id(user_id: str) -> bool:
    return not bool(UUID_RE.match(str(user_id)))


def is_bot_event(event: str) -> bool:
    return event in ("BotPosition", "BotKill", "BotKilled")


def display_id(match_id: str) -> str:
    return NAKAMA_SUFFIX_RE.sub("", match_id)


def world_to_pixel(x, z, cfg):
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    px = u * 1024
    py = (1 - v) * 1024
    return px, py


# ---------------------------------------------------------------------------
# Step 1: Load all parquet files
# ---------------------------------------------------------------------------

def load_all_parquet() -> pd.DataFrame:
    frames = []
    for folder_name, date_str in DATE_MAP.items():
        folder = DATA_ROOT / folder_name
        if not folder.is_dir():
            print(f"  WARNING: folder {folder} not found, skipping")
            continue
        for fname in os.listdir(folder):
            fpath = folder / fname
            if fname == "README.md" or fname.startswith("."):
                continue
            try:
                table = pq.read_table(str(fpath))
                df = table.to_pandas()
                df["_date"] = date_str
                df["_source_file"] = fname
                frames.append(df)
                report["files_processed"] += 1
                report["total_parquet_rows"] += len(df)
            except Exception as e:
                report["files_skipped"].append({"file": str(fpath), "error": str(e)})
    if not frames:
        print("FATAL: No parquet files loaded")
        sys.exit(1)
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------------------
# Step 2: Decode events
# ---------------------------------------------------------------------------

def decode_events(df: pd.DataFrame) -> pd.DataFrame:
    df["event"] = df["event"].apply(
        lambda x: x.decode("utf-8") if isinstance(x, bytes) else str(x)
    )
    unknown = df[~df["event"].isin(KNOWN_EVENTS)]
    if len(unknown) > 0:
        report["unknown_events"] = unknown["event"].unique().tolist()
        print(f"  WARNING: {len(unknown)} rows with unknown events: {report['unknown_events']}")

    for evt in KNOWN_EVENTS:
        report["event_counts"][evt] = int((df["event"] == evt).sum())
    return df


# ---------------------------------------------------------------------------
# Step 3: Bot detection (cross-validated)
# ---------------------------------------------------------------------------

def validate_bots(df: pd.DataFrame) -> pd.DataFrame:
    df["is_bot"] = df["user_id"].apply(lambda uid: is_bot_by_id(str(uid)))

    # Cross-validate with event types (vectorized)
    # BotPosition = bot's position → only bots should have this
    # BotKill = human killed a bot → humans have this (NOT a mismatch)
    # BotKilled = human was killed by a bot → humans have this (NOT a mismatch)
    # Position = human's position → only humans should have this
    # Kill/Killed = human vs human combat → only humans should have this
    bot_only_events = df["event"].isin({"BotPosition"})
    human_only_events = df["event"].isin({"Position", "Kill", "Killed"})

    # True mismatch: bot-only event from human user, or human-only event from bot user
    mismatch_mask = (bot_only_events & ~df["is_bot"]) | (human_only_events & df["is_bot"])
    mismatch_count = int(mismatch_mask.sum())

    if mismatch_count > 0:
        sample = df[mismatch_mask].head(20)
        report["bot_detection_mismatches"] = [
            {"user_id": str(r["user_id"]), "event": r["event"]}
            for _, r in sample.iterrows()
        ]
        print(f"  WARNING: {mismatch_count} bot detection mismatches (showing first 20)")
    else:
        print(f"  No bot detection mismatches found")
    return df


# ---------------------------------------------------------------------------
# Step 4: Timestamp normalization
# ---------------------------------------------------------------------------

def normalize_timestamps(df: pd.DataFrame) -> pd.DataFrame:
    # Convert timestamp to total seconds from epoch
    df["ts_seconds"] = df["ts"].astype("int64") / 1e9  # nanoseconds to seconds

    # Per-match: subtract minimum to get relative time
    match_mins = df.groupby("match_id")["ts_seconds"].transform("min")
    df["relative_time"] = df["ts_seconds"] - match_mins
    return df


# ---------------------------------------------------------------------------
# Step 5: Coordinate pre-computation
# ---------------------------------------------------------------------------

def compute_pixel_coords(df: pd.DataFrame) -> pd.DataFrame:
    df["px"] = 0.0
    df["py"] = 0.0

    oob_count = 0
    total = 0

    for map_id, cfg in MAP_CONFIG.items():
        mask = df["map_id"] == map_id
        subset = df.loc[mask]
        if len(subset) == 0:
            continue

        x_vals = subset["x"].values
        z_vals = subset["z"].values

        u = (x_vals - cfg["origin_x"]) / cfg["scale"]
        v = (z_vals - cfg["origin_z"]) / cfg["scale"]
        px = u * 1024
        py = (1 - v) * 1024

        # Count out-of-bounds before clamping
        oob = ((px < 0) | (px > 1024) | (py < 0) | (py > 1024)).sum()
        oob_count += int(oob)
        total += len(subset)

        # Clamp
        px = np.clip(px, 0, 1024)
        py = np.clip(py, 0, 1024)

        df.loc[mask, "px"] = px
        df.loc[mask, "py"] = py

    report["out_of_bounds"]["count"] = oob_count
    report["out_of_bounds"]["percentage"] = round(oob_count / total * 100, 2) if total > 0 else 0
    print(f"  Coordinates: {oob_count}/{total} out-of-bounds ({report['out_of_bounds']['percentage']}%)")
    return df


# ---------------------------------------------------------------------------
# Step 6: Build output JSONs
# ---------------------------------------------------------------------------

def build_match_jsons(df: pd.DataFrame):
    index = {}  # map_id -> date -> [match_summary]
    total_json_events = 0

    grouped = df.groupby("match_id")
    match_count = 0

    for match_id, match_df in grouped:
        map_id = match_df["map_id"].iloc[0]
        date = match_df["_date"].iloc[0]

        # Build players list
        players = []
        player_groups = match_df.groupby("user_id")
        player_count = 0
        bot_count = 0

        for user_id, player_df in player_groups:
            is_bot = player_df["is_bot"].iloc[0]
            if is_bot:
                bot_count += 1
            else:
                player_count += 1

            events = []
            for _, row in player_df.sort_values("relative_time").iterrows():
                events.append({
                    "type": row["event"],
                    "px": round(float(row["px"]), 1),
                    "py": round(float(row["py"]), 1),
                    "elevation": round(float(row["y"]), 1),
                    "t": round(float(row["relative_time"]), 2),
                })
            total_json_events += len(events)

            players.append({
                "user_id": str(user_id),
                "is_bot": bool(is_bot),
                "events": events,
            })

        duration = round(float(match_df["relative_time"].max()), 1)

        # Pre-compute stats
        kill_events = match_df["event"].isin(["Kill", "BotKill"])
        death_events = match_df["event"].isin(["Killed", "BotKilled"])
        storm_events = match_df["event"] == "KilledByStorm"
        loot_events = match_df["event"] == "Loot"

        stats = {
            "total_kills": int(kill_events.sum()),
            "total_deaths": int(death_events.sum()),
            "storm_deaths": int(storm_events.sum()),
            "loot_pickups": int(loot_events.sum()),
            "player_count": player_count,
            "bot_count": bot_count,
        }

        match_data = {
            "match_id": str(match_id),
            "display_id": display_id(str(match_id)),
            "map_id": map_id,
            "date": date,
            "duration_seconds": duration,
            "stats": stats,
            "players": players,
        }

        # Write match file
        safe_id = str(match_id).replace("/", "_")
        match_path = OUTPUT_ROOT / "data" / "matches" / f"{safe_id}.json"
        with open(match_path, "w") as f:
            json.dump(match_data, f, separators=(",", ":"))
        match_count += 1

        # Build index entry
        disp = display_id(str(match_id))
        summary = {
            "match_id": str(match_id),
            "display_id": disp,
            "player_count": player_count,
            "bot_count": bot_count,
            "kill_count": stats["total_kills"],
            "death_count": stats["total_deaths"],
            "storm_death_count": stats["storm_deaths"],
            "loot_count": stats["loot_pickups"],
            "duration_seconds": duration,
        }

        if map_id not in index:
            index[map_id] = {}
        if date not in index[map_id]:
            index[map_id][date] = []
        index[map_id][date].append(summary)

    # Write index
    index_path = OUTPUT_ROOT / "data" / "index.json"
    with open(index_path, "w") as f:
        json.dump(index, f, separators=(",", ":"))

    report["total_json_events"] = total_json_events
    report["matches_written"] = match_count
    print(f"  Wrote {match_count} match files + index.json")
    print(f"  Total JSON events: {total_json_events}")


# ---------------------------------------------------------------------------
# Step 7: Heatmaps
# ---------------------------------------------------------------------------

def build_heatmaps(df: pd.DataFrame):
    for map_id in MAP_CONFIG:
        map_df = df[df["map_id"] == map_id]
        for htype, hcfg in HEATMAP_CONFIG.items():
            grid_size = hcfg["grid"]
            sigma = hcfg["sigma"]
            events = hcfg["events"]

            subset = map_df[map_df["event"].isin(events)]
            grid = np.zeros((grid_size, grid_size), dtype=np.float64)

            if len(subset) > 0:
                # Map pixel coords (0-1024) to grid cells
                gx = np.clip((subset["px"].values / 1024 * grid_size).astype(int), 0, grid_size - 1)
                gy = np.clip((subset["py"].values / 1024 * grid_size).astype(int), 0, grid_size - 1)
                for xi, yi in zip(gx, gy):
                    grid[yi, xi] += 1

                if sigma > 0:
                    grid = gaussian_filter(grid, sigma=sigma)

                # Normalize to 0-1
                max_val = grid.max()
                if max_val > 0:
                    grid = grid / max_val

            # Output as list of lists, rounded
            grid_list = [[round(float(v), 3) for v in row] for row in grid]
            out_path = OUTPUT_ROOT / "data" / "heatmaps" / f"{map_id}_{htype}.json"
            with open(out_path, "w") as f:
                json.dump({"grid": grid_list, "size": grid_size}, f, separators=(",", ":"))

    print(f"  Wrote {len(MAP_CONFIG) * len(HEATMAP_CONFIG)} heatmap files")


# ---------------------------------------------------------------------------
# Step 8: Process minimaps
# ---------------------------------------------------------------------------

def process_minimaps():
    minimap_dir = DATA_ROOT / "minimaps"
    out_dir = OUTPUT_ROOT / "minimaps"
    os.makedirs(out_dir, exist_ok=True)

    files = {
        "AmbroseValley": "AmbroseValley_Minimap.png",
        "GrandRift": "GrandRift_Minimap.png",
        "Lockdown": "Lockdown_Minimap.jpg",
    }

    for map_name, fname in files.items():
        src = minimap_dir / fname
        img = Image.open(src)
        print(f"  {map_name}: original {img.size}")

        if img.size != (1024, 1024):
            if img.width != img.height:
                # Pad to square first
                size = max(img.width, img.height)
                padded = Image.new(img.mode, (size, size), (0, 0, 0))
                padded.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
                img = padded
                print(f"    Padded to {img.size}")
            img = img.resize((1024, 1024), Image.LANCZOS)
            print(f"    Resized to {img.size}")

        out_path = out_dir / f"{map_name}.png"
        img.save(str(out_path), "PNG", optimize=True)


# ---------------------------------------------------------------------------
# Step 9: Post-write verification
# ---------------------------------------------------------------------------

def verify_output():
    """Re-read all match JSONs and verify total event count matches parquet source."""
    match_dir = OUTPUT_ROOT / "data" / "matches"
    total_events = 0
    match_files = list(match_dir.glob("*.json"))

    for mf in match_files:
        with open(mf) as f:
            data = json.load(f)
        for player in data["players"]:
            total_events += len(player["events"])

    if total_events != report["total_json_events"]:
        print(f"FATAL: Post-write verification failed! Written={report['total_json_events']}, Re-read={total_events}")
        sys.exit(1)

    if total_events != report["total_parquet_rows"]:
        print(f"FATAL: Event count mismatch! Parquet={report['total_parquet_rows']}, JSON={total_events}")
        sys.exit(1)

    print(f"  Verification passed: {total_events} events match across parquet → JSON → re-read")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("LILA BLACK Data Pipeline")
    print("=" * 60)

    print("\n[1/8] Loading parquet files...")
    df = load_all_parquet()
    print(f"  Loaded {len(df)} rows from {report['files_processed']} files")

    print("\n[2/8] Decoding events...")
    df = decode_events(df)
    for evt, cnt in sorted(report["event_counts"].items(), key=lambda x: -x[1]):
        print(f"    {evt}: {cnt}")

    print("\n[3/8] Validating bot detection...")
    df = validate_bots(df)

    print("\n[4/8] Normalizing timestamps...")
    df = normalize_timestamps(df)

    print("\n[5/8] Computing pixel coordinates...")
    df = compute_pixel_coords(df)

    print("\n[6/8] Building match JSONs...")
    build_match_jsons(df)

    print("\n[7/8] Building heatmaps...")
    build_heatmaps(df)

    print("\n[8/8] Processing minimaps...")
    process_minimaps()

    print("\n[VERIFY] Post-write verification...")
    verify_output()

    # Write pipeline report
    report_path = Path(__file__).resolve().parent / "pipeline_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nPipeline report written to {report_path}")

    print("\n" + "=" * 60)
    print("Pipeline complete!")
    print(f"  Files: {report['files_processed']} parquet → {report['matches_written']} match JSONs")
    print(f"  Events: {report['total_parquet_rows']} parquet rows → {report['total_json_events']} JSON events")
    print("=" * 60)


if __name__ == "__main__":
    main()
