import { useState, useRef, useEffect, useCallback } from "react";

interface AudioPlayerProps {
  src: string;
  title: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Playback helpers ────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [duration]);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  }, [duration]);

  // ── Audio event wiring ──────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => { setLoading(false); setDuration(audio.duration); };
    const onTime = () => { if (!dragging) setCurrentTime(audio.currentTime); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onError = () => { setLoading(false); setAudioError(true); };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    // If metadata was already loaded before this effect ran (common during
    // Astro SSR hydration or on page refresh with a cached response), the
    // loadedmetadata/canplay events have already fired and won't repeat.
    // Sync state from the element's current readyState to avoid a stuck spinner.
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setLoading(false);
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
  }, [dragging]);

  // ── Progress bar drag ───────────────────────────────────────────

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    seek(e.clientX);

    const onMove = (ev: MouseEvent) => seek(ev.clientX);
    const onUp = (ev: MouseEvent) => {
      seek(ev.clientX);
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [seek]);

  // Touch support for mobile.
  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
    seek(e.touches[0].clientX);

    const onMove = (ev: TouchEvent) => seek(ev.touches[0].clientX);
    const onEnd = (ev: TouchEvent) => {
      seek(ev.changedTouches[0].clientX);
      setDragging(false);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }, [seek]);

  // ── Volume ──────────────────────────────────────────────────────

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      audio.volume = volume || 1;
      setMuted(false);
    } else {
      audio.volume = 0;
      setMuted(true);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-5 sm:p-6">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="relative h-2 rounded-full bg-[var(--color-dc-border)] cursor-pointer mb-4 group"
        onMouseDown={handleProgressMouseDown}
        onTouchStart={handleProgressTouchStart}
        role="slider"
        aria-label="Seek"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
      >
        {/* Filled track */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--color-dc-accent)] transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4">
        {/* Skip back */}
        <button
          onClick={() => skip(-15)}
          className="text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)] transition-colors text-sm font-semibold"
          aria-label="Skip back 15 seconds"
        >
          ↩ 15
        </button>

        {/* Play / pause */}
        <button
          onClick={togglePlay}
          disabled={loading || audioError}
          className="w-12 h-12 rounded-full bg-[var(--color-dc-accent)] hover:bg-[var(--color-dc-accent-hover)] disabled:opacity-50 text-white flex items-center justify-center transition-colors shadow-lg shadow-[var(--color-dc-accent)]/25 flex-shrink-0"
          aria-label={playing ? "Pause" : "Play"}
          title={audioError ? "Audio failed to load" : undefined}
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : audioError ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <path d="M9 1.5a7.5 7.5 0 1 0 0 15A7.5 7.5 0 0 0 9 1.5zM8.25 5.25h1.5v5.25h-1.5V5.25zm0 6.75h1.5v1.5h-1.5V12z" />
            </svg>
          ) : playing ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <rect x="3" y="2" width="4" height="14" rx="1" />
              <rect x="11" y="2" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M4 2.5l12 6.5-12 6.5z" />
            </svg>
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={() => skip(30)}
          className="text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)] transition-colors text-sm font-semibold"
          aria-label="Skip forward 30 seconds"
        >
          30 ↪
        </button>

        {/* Time display */}
        <div className="flex-1 text-center text-sm text-[var(--color-dc-muted)] font-mono tabular-nums">
          {formatTime(currentTime)}
          <span className="mx-1 opacity-50">/</span>
          {formatTime(duration)}
        </div>

        {/* Volume */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)] transition-colors"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolume}
            className="w-20 h-1 accent-[var(--color-dc-accent)] cursor-pointer"
            aria-label="Volume"
          />
        </div>

        {/* Download */}
        <a
          href={src}
          download={`${title}.mp3`}
          className="text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)] transition-colors"
          aria-label="Download MP3"
          title="Download MP3"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11l-4-4h2.5V2h3v5H12L8 11z" />
            <rect x="2" y="13" width="12" height="1.5" rx=".75" />
          </svg>
        </a>
      </div>
    </div>
  );
}
