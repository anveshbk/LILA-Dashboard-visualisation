function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Timeline({
  currentTime, setCurrentTime,
  isPlaying, togglePlay,
  speed, cycleSpeed,
  duration,
}) {
  if (duration <= 0) return null;

  return (
    <div className="timeline">
      <button className="btn btn-play" onClick={togglePlay}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="btn btn-speed" onClick={cycleSpeed}>
        {speed}x
      </button>
      <span className="time-display">{formatTime(currentTime)}</span>
      <input
        type="range"
        className="timeline-slider"
        min={0}
        max={duration}
        step={0.1}
        value={currentTime}
        onChange={e => setCurrentTime(parseFloat(e.target.value))}
      />
      <span className="time-display">{formatTime(duration)}</span>
    </div>
  );
}
