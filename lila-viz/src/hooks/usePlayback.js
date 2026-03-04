import { useState, useRef, useCallback, useEffect } from 'react';

export function usePlayback(duration = 0) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);

  // Stable refs for keyboard handler
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed(s => {
      if (s === 1) return 2;
      if (s === 2) return 4;
      return 1;
    });
  }, []);

  // Reset when duration changes (new match loaded)
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    lastFrameRef.current = null;
  }, [duration]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || duration <= 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    const tick = (timestamp) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }
      const delta = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;

      setCurrentTime(prev => {
        const next = prev + delta * speed;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, duration]);

  return {
    currentTime, setCurrentTime,
    isPlaying, togglePlay,
    speed, setSpeed, cycleSpeed,
    duration,
    // Expose refs for keyboard handler
    isPlayingRef, currentTimeRef, durationRef,
  };
}
