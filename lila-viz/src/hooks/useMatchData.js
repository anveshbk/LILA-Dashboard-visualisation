import { useState, useEffect, useCallback, useRef } from 'react';

const LRU_SIZE = 20;

export function useMatchData() {
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [allMatchesData, setAllMatchesData] = useState(null); // merged data for "All Matches"
  const [heatmapData, setHeatmapData] = useState({});
  const cacheRef = useRef(new Map());

  // Load index on mount
  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then(data => {
        setIndex(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load index:', err);
        setLoading(false);
      });
  }, []);

  // Load a specific match with LRU cache
  const loadMatch = useCallback(async (matchId) => {
    const cache = cacheRef.current;
    if (cache.has(matchId)) {
      const data = cache.get(matchId);
      cache.delete(matchId);
      cache.set(matchId, data);
      setMatchData(data);
      setAllMatchesData(null);
      return data;
    }

    setMatchLoading(true);
    try {
      const res = await fetch(`/data/matches/${matchId}.json`);
      const data = await res.json();
      if (cache.size >= LRU_SIZE) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
      }
      cache.set(matchId, data);
      setMatchData(data);
      setAllMatchesData(null);
    } catch (err) {
      console.error('Failed to load match:', err);
    }
    setMatchLoading(false);
  }, []);

  // Load all matches for a map+date combination (merges into one view)
  const loadAllMatches = useCallback(async (matchIds) => {
    setMatchLoading(true);
    setMatchData(null);
    const cache = cacheRef.current;
    const results = [];

    // Load in batches of 10 to avoid overwhelming the browser
    for (let i = 0; i < matchIds.length; i += 10) {
      const batch = matchIds.slice(i, i + 10);
      const promises = batch.map(async (id) => {
        if (cache.has(id)) return cache.get(id);
        try {
          const res = await fetch(`/data/matches/${id}.json`);
          const data = await res.json();
          cache.set(id, data);
          return data;
        } catch { return null; }
      });
      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(Boolean));
    }

    // Merge into a single view
    const merged = {
      match_id: '__all__',
      display_id: 'All Matches',
      map_id: results[0]?.map_id || '',
      date: results[0]?.date || '',
      duration_seconds: Math.max(...results.map(r => r.duration_seconds), 0),
      stats: {
        total_kills: results.reduce((s, r) => s + r.stats.total_kills, 0),
        total_deaths: results.reduce((s, r) => s + r.stats.total_deaths, 0),
        storm_deaths: results.reduce((s, r) => s + r.stats.storm_deaths, 0),
        loot_pickups: results.reduce((s, r) => s + r.stats.loot_pickups, 0),
        player_count: results.reduce((s, r) => s + r.stats.player_count, 0),
        bot_count: results.reduce((s, r) => s + r.stats.bot_count, 0),
      },
      players: results.flatMap(r => r.players),
      _matchCount: results.length,
    };

    setAllMatchesData(merged);
    setMatchLoading(false);
  }, []);

  const clearMatch = useCallback(() => {
    setMatchData(null);
    setAllMatchesData(null);
  }, []);

  // Load heatmap grid
  const loadHeatmap = useCallback(async (mapId, type) => {
    const key = `${mapId}_${type}`;
    if (heatmapData[key]) return heatmapData[key];
    try {
      const res = await fetch(`/data/heatmaps/${key}.json`);
      const data = await res.json();
      setHeatmapData(prev => ({ ...prev, [key]: data }));
      return data;
    } catch (err) {
      console.error('Failed to load heatmap:', err);
      return null;
    }
  }, [heatmapData]);

  // The "active" data is either a single match or all-matches merged
  const activeData = matchData || allMatchesData;

  return {
    index, loading,
    matchData, allMatchesData, activeData,
    matchLoading, loadMatch, loadAllMatches, clearMatch,
    heatmapData, loadHeatmap,
  };
}
