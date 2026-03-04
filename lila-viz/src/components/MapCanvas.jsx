import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { getPlayerColor, EVENT_STYLES, heatmapGradient, PLAYER_COLORS, BOT_COLOR } from '../utils/colors';

const MAX_ZOOM = 8;
const MIN_ZOOM = 1;
const CANVAS_SIZE = 1024;
const MARKER_BASE_SIZE = 12;
const HIT_RADIUS = 14;

function drawMarker(ctx, shape, x, y, size, color, alpha = 0.85, highlight = false) {
  const half = size / 2;

  if (highlight) {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = alpha;
  }

  // Black outline for contrast
  ctx.save();
  ctx.globalAlpha = highlight ? 1 : alpha * 0.5;
  switch (shape) {
    case 'crosshair':
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y - half); ctx.lineTo(x, y + half);
      ctx.moveTo(x - half, y); ctx.lineTo(x + half, y);
      ctx.stroke();
      break;
    case 'x':
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - half, y - half); ctx.lineTo(x + half, y + half);
      ctx.moveTo(x + half, y - half); ctx.lineTo(x - half, y + half);
      ctx.stroke();
      break;
    case 'diamond':
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - half); ctx.lineTo(x + half, y); ctx.lineTo(x, y + half); ctx.lineTo(x - half, y); ctx.closePath();
      ctx.stroke();
      break;
    case 'square':
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - half, y - half, size, size);
      break;
  }
  ctx.restore();

  // Colored marker
  ctx.globalAlpha = highlight ? 1 : alpha;
  switch (shape) {
    case 'crosshair':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - half); ctx.lineTo(x, y + half);
      ctx.moveTo(x - half, y); ctx.lineTo(x + half, y);
      ctx.stroke();
      break;
    case 'x':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - half, y - half); ctx.lineTo(x + half, y + half);
      ctx.moveTo(x + half, y - half); ctx.lineTo(x - half, y + half);
      ctx.stroke();
      break;
    case 'diamond':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - half); ctx.lineTo(x + half, y); ctx.lineTo(x, y + half); ctx.lineTo(x - half, y); ctx.closePath();
      ctx.fill();
      break;
    case 'square':
      ctx.fillStyle = color;
      ctx.fillRect(x - half, y - half, size, size);
      break;
  }

  if (highlight) ctx.restore();
  ctx.globalAlpha = 1;
}

const MapCanvas = forwardRef(function MapCanvas({
  activeData, currentTime, showBots, showTrails, selectedPlayerId,
  heatmapGrid, mapId, onEventClick,
  hoveredEventIdx, playerIndexMap, enabledEventTypes,
}, ref) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [transform, setTransform] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTransform = useRef({ offsetX: 0, offsetY: 0 });

  // Load minimap image
  useEffect(() => {
    if (!mapId) return;
    const img = new Image();
    img.src = `/minimaps/${mapId}.png`;
    img.onload = () => { imageRef.current = img; };
  }, [mapId]);

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    resetZoom: () => setTransform({ zoom: 1, offsetX: 0, offsetY: 0 }),
  }));

  useEffect(() => {
    setTransform({ zoom: 1, offsetX: 0, offsetY: 0 });
  }, [activeData?.match_id]);

  const screenToWorld = useCallback((screenX, screenY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { zoom, offsetX, offsetY } = transform;
    const scale = Math.min(containerSize.w, containerSize.h) / CANVAS_SIZE;
    const cx = (screenX - rect.left) / scale;
    const cy = (screenY - rect.top) / scale;
    return { x: (cx - offsetX) / zoom, y: (cy - offsetY) / zoom };
  }, [transform, containerSize]);

  // Main draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { zoom, offsetX, offsetY } = transform;

    const displaySize = Math.min(containerSize.w, containerSize.h);
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // 1. Minimap
    if (imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // 2. Heatmap overlay
    if (heatmapGrid?.grid) {
      const { grid, size: gridSize } = heatmapGrid;
      const cellW = CANVAS_SIZE / gridSize;
      const cellH = CANVAS_SIZE / gridSize;
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          if (grid[row][col] > 0.01) {
            ctx.fillStyle = heatmapGradient(grid[row][col]);
            ctx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
    }

    // 3. Player trails and events
    if (activeData) {
      const markerSize = Math.max(MARKER_BASE_SIZE / zoom, 6);

      // Find the selected player's hovered event for highlighting
      let hoveredEvt = null;
      if (selectedPlayerId != null && hoveredEventIdx != null) {
        const selPlayer = activeData.players.find(p => p.user_id === selectedPlayerId);
        if (selPlayer && selPlayer.events[hoveredEventIdx]) {
          hoveredEvt = selPlayer.events[hoveredEventIdx];
        }
      }

      for (const player of activeData.players) {
        if (!showBots && player.is_bot) continue;
        if (selectedPlayerId && player.user_id !== selectedPlayerId) continue;

        const pIdx = playerIndexMap?.[player.user_id] ?? 0;
        const isBot = player.is_bot;
        const trailColor = isBot
          ? `rgba(136, 136, 136, 0.5)`
          : PLAYER_COLORS[pIdx % PLAYER_COLORS.length];

        const visible = player.events.filter(e => e.t <= currentTime);
        if (visible.length === 0) continue;

        // Trail (only if showTrails is enabled)
        if (showTrails) {
          const posEvents = visible.filter(e => e.type === 'Position' || e.type === 'BotPosition');
          if (posEvents.length > 1) {
            // Black outline for contrast
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = (isBot ? 3 : 5) / zoom;
            ctx.setLineDash([]);
            ctx.moveTo(posEvents[0].px, posEvents[0].py);
            for (let i = 1; i < posEvents.length; i++) ctx.lineTo(posEvents[i].px, posEvents[i].py);
            ctx.stroke();

            // Colored trail
            ctx.beginPath();
            ctx.strokeStyle = trailColor;
            ctx.lineWidth = (isBot ? 1.5 : 3) / zoom;
            if (isBot) ctx.setLineDash([6 / zoom, 4 / zoom]);
            else ctx.setLineDash([]);
            ctx.moveTo(posEvents[0].px, posEvents[0].py);
            for (let i = 1; i < posEvents.length; i++) ctx.lineTo(posEvents[i].px, posEvents[i].py);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Event markers (filtered by enabledEventTypes)
        for (let eIdx = 0; eIdx < visible.length; eIdx++) {
          const evt = visible[eIdx];
          const style = EVENT_STYLES[evt.type];
          if (!style) continue;
          if (!enabledEventTypes.has(evt.type)) continue;
          const isHighlighted = hoveredEvt && evt.px === hoveredEvt.px && evt.py === hoveredEvt.py && evt.t === hoveredEvt.t;
          drawMarker(ctx, style.shape, evt.px, evt.py, isHighlighted ? markerSize * 1.8 : markerSize, style.color, 0.9, isHighlighted);
        }

        // Current position dot (only if trails enabled)
        if (showTrails) {
          const posEvents = visible.filter(e => e.type === 'Position' || e.type === 'BotPosition');
          if (posEvents.length > 0) {
            const last = posEvents[posEvents.length - 1];
            ctx.beginPath();
            ctx.arc(last.px, last.py, (isBot ? 5 : 7) / zoom, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(last.px, last.py, (isBot ? 3.5 : 5) / zoom, 0, Math.PI * 2);
            ctx.fillStyle = trailColor;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
          }
        }
      }

      // Draw hovered event tooltip on canvas
      if (hoveredEvt) {
        const style = EVENT_STYLES[hoveredEvt.type];
        if (style) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(hoveredEvt.px, hoveredEvt.py, markerSize * 2, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([3 / zoom, 3 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }

    ctx.restore();

    // "No data" prompt
    if (!activeData) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = '#aaa';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a match from the sidebar to begin', CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    }
  }, [activeData, currentTime, showBots, showTrails, selectedPlayerId, heatmapGrid, transform, containerSize, mapId, hoveredEventIdx, playerIndexMap, enabledEventTypes]);

  // Scroll-to-zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const displaySize = Math.min(containerSize.w, containerSize.h);
    const scale = displaySize / CANVAS_SIZE;
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;

    setTransform(prev => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      return {
        zoom: newZoom,
        offsetX: mx - (mx - prev.offsetX) * (newZoom / prev.zoom),
        offsetY: my - (my - prev.offsetY) * (newZoom / prev.zoom),
      };
    });
  }, [containerSize]);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastTransform.current = { offsetX: transform.offsetX, offsetY: transform.offsetY };
  }, [transform]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const displaySize = Math.min(containerSize.w, containerSize.h);
    const scale = displaySize / CANVAS_SIZE;
    const dx = (e.clientX - dragStart.current.x) / scale;
    const dy = (e.clientY - dragStart.current.y) / scale;
    setTransform(prev => ({
      ...prev,
      offsetX: lastTransform.current.offsetX + dx,
      offsetY: lastTransform.current.offsetY + dy,
    }));
  }, [containerSize]);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  const handleClick = useCallback((e) => {
    if (!activeData) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const hitRadius = HIT_RADIUS / transform.zoom;
    let closest = null;
    let closestDist = Infinity;

    for (const player of activeData.players) {
      if (!showBots && player.is_bot) continue;
      if (selectedPlayerId && player.user_id !== selectedPlayerId) continue;
      for (const evt of player.events) {
        if (evt.t > currentTime) continue;
        if (!EVENT_STYLES[evt.type]) continue;
        if (!enabledEventTypes.has(evt.type)) continue;
        const dx = evt.px - world.x;
        const dy = evt.py - world.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitRadius && dist < closestDist) {
          closestDist = dist;
          closest = { ...evt, userId: player.user_id, isBot: player.is_bot };
        }
      }
    }

    onEventClick(closest || null, closest ? { x: e.clientX, y: e.clientY } : null);
  }, [activeData, currentTime, showBots, selectedPlayerId, transform, screenToWorld, onEventClick, enabledEventTypes]);

  return (
    <div ref={containerRef} className="map-canvas-container" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
      />
    </div>
  );
});

export default MapCanvas;
