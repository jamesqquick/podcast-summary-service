import { useState, useRef, useCallback, useEffect } from "react";
import type { EpisodeView } from "../lib/api";

// ── Constants ────────────────────────────────────────────────────────

const MAX_LINKS = 5;
const MIN_LINKS = 1;
const POLL_INTERVAL_MS = 2500;

const VOICES = [
  { id: "asteria", label: "Asteria", hint: "Warm · Female" },
  { id: "luna", label: "Luna", hint: "Bright · Female" },
  { id: "athena", label: "Athena", hint: "Precise · Female" },
  { id: "hera", label: "Hera", hint: "Commanding · Female" },
  { id: "stella", label: "Stella", hint: "Conversational · Female" },
  { id: "zeus", label: "Zeus", hint: "Bold · Male" },
  { id: "orpheus", label: "Orpheus", hint: "Rich · Male" },
  { id: "orion", label: "Orion", hint: "Strong · Male" },
  { id: "angus", label: "Angus", hint: "Steady · Male" },
  { id: "arcas", label: "Arcas", hint: "Smooth · Male" },
  { id: "perseus", label: "Perseus", hint: "Clear · Male" },
  { id: "helios", label: "Helios", hint: "Vibrant · Male" },
] as const;

type VoiceId = (typeof VOICES)[number]["id"];

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued — waiting to start…",
  extracting: "Reading your links…",
  writing_script: "Writing the script…",
  synthesizing: "Recording the audio…",
  stitching: "Putting it all together…",
  done: "Done!",
};

type PageState = "idle" | "generating" | "done" | "error";

// ── Props ────────────────────────────────────────────────────────────

interface GeneratorProps {
  /** Cloudflare Turnstile site key. Empty = skip Turnstile (dev mode). */
  turnstileSiteKey?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function Generator({ turnstileSiteKey }: GeneratorProps) {
  const [links, setLinks] = useState<string[]>(["", ""]);
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState<VoiceId>("asteria");
  const [pageState, setPageState] = useState<PageState>("idle");
  const [stage, setStage] = useState("queued");
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Load Turnstile script once on mount when a site key is provided.
  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;
    if (document.getElementById("cf-turnstile-script")) return;

    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [turnstileSiteKey]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  // Clears any running poll on unmount.
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Link field helpers ──────────────────────────────────────────

  const addLink = () => {
    if (links.length < MAX_LINKS) setLinks((prev) => [...prev, ""]);
  };

  const removeLink = (idx: number) => {
    if (links.length <= MIN_LINKS) return;
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLink = (idx: number, value: string) => {
    setLinks((prev) => prev.map((l, i) => (i === idx ? value : l)));
  };

  // ── Generation ──────────────────────────────────────────────────

  async function pollEpisode(episodeId: string) {
    try {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (!res.ok) return; // transient failure — keep polling
      const data = (await res.json()) as EpisodeView;
      setStage(data.stage);

      if (data.status === "ready") {
        stopPolling();
        setPageState("done");
        window.location.href = `/e/${episodeId}`;
      } else if (data.status === "failed") {
        stopPolling();
        setPageState("error");
        setErrorMsg(data.error ?? "Generation failed. Please try again.");
      }
    } catch {
      // Network blip — keep polling
    }
  }

  async function handleGenerate() {
    const validLinks = links.map((l) => l.trim()).filter(Boolean);

    if (validLinks.length < MIN_LINKS) {
      setErrorMsg("Add at least one link.");
      setPageState("error");
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setErrorMsg("Please complete the human verification below.");
      setPageState("error");
      return;
    }

    setPageState("generating");
    setStage("queued");
    setErrorMsg("");

    try {
      const body: Record<string, unknown> = { links: validLinks, voice };
      if (title.trim()) body.title = title.trim();
      if (turnstileToken) body.cfTurnstileToken = turnstileToken;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Request failed: ${res.status}`);
      }

      const episode = (await res.json()) as EpisodeView;
      setStage(episode.stage);

      pollTimerRef.current = setInterval(() => pollEpisode(episode.id), POLL_INTERVAL_MS);
    } catch (err) {
      setPageState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  // ── Generating progress view ────────────────────────────────────

  // Capture before early return so TypeScript treats it as `boolean` not a narrowed union.
  const isGenerating = pageState === "generating";

  if (isGenerating) {
    return (
      <div className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-10 text-center">
        <WaveformAnimation />
        <p className="text-lg font-bold text-[var(--color-dc-text)] mt-6 mb-2">
          {STAGE_LABELS[stage] ?? "Generating…"}
        </p>
        <p className="text-sm text-[var(--color-dc-muted)]">
          This usually takes 60–120 seconds. Hang tight.
        </p>
        <StageDots stage={stage} />
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {pageState === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--color-dc-error)]/30 bg-[var(--color-dc-error)]/10">
          <span className="text-[var(--color-dc-error)] mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-dc-error)]">Something went wrong</p>
            <p className="text-sm text-[var(--color-dc-muted)] mt-0.5">{errorMsg}</p>
          </div>
          <button
            onClick={() => setPageState("idle")}
            className="ml-auto text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)] text-sm transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Link inputs */}
      <section className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-6">
        <h2 className="text-sm font-bold text-[var(--color-dc-muted)] uppercase tracking-widest mb-4">
          Your links (2–5)
        </h2>
        <div className="space-y-2.5">
          {links.map((link, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--color-dc-faint)] w-5 text-right flex-shrink-0">
                {idx + 1}
              </span>
              <input
                type="url"
                value={link}
                onChange={(e) => updateLink(idx, e.target.value)}
                placeholder="https://..."
                className="flex-1 bg-[var(--color-dc-surface-2)] border border-[var(--color-dc-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-dc-text)] placeholder:text-[var(--color-dc-faint)] focus:outline-none focus:border-[var(--color-dc-accent)] transition-colors"
              />
              {links.length > MIN_LINKS && (
                <button
                  onClick={() => removeLink(idx)}
                  className="text-[var(--color-dc-faint)] hover:text-[var(--color-dc-error)] text-lg leading-none transition-colors flex-shrink-0 w-6 h-6 flex items-center justify-center"
                  aria-label="Remove link"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {links.length < MAX_LINKS && (
          <button
            onClick={addLink}
            className="mt-3 text-sm text-[var(--color-dc-accent-light)] hover:text-[var(--color-dc-accent)] transition-colors flex items-center gap-1.5"
          >
            <span className="text-lg leading-none">+</span>
            Add another link
          </button>
        )}
      </section>

      {/* Optional title */}
      <section className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-6">
        <h2 className="text-sm font-bold text-[var(--color-dc-muted)] uppercase tracking-widest mb-4">
          Episode title{" "}
          <span className="text-[var(--color-dc-faint)] font-normal normal-case tracking-normal">
            (optional — AI generates one if left blank)
          </span>
        </h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. This week in AI — June 2025"
          maxLength={200}
          className="w-full bg-[var(--color-dc-surface-2)] border border-[var(--color-dc-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-dc-text)] placeholder:text-[var(--color-dc-faint)] focus:outline-none focus:border-[var(--color-dc-accent)] transition-colors"
        />
      </section>

      {/* Voice picker */}
      <section className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-6">
        <h2 className="text-sm font-bold text-[var(--color-dc-muted)] uppercase tracking-widest mb-4">
          Narrator voice
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VOICES.map(({ id, label, hint }) => (
            <button
              key={id}
              onClick={() => setVoice(id)}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                voice === id
                  ? "border-[var(--color-dc-accent)] bg-[var(--color-dc-accent-subtle)] text-[var(--color-dc-text)]"
                  : "border-[var(--color-dc-border)] hover:border-[var(--color-dc-faint)] text-[var(--color-dc-muted)] hover:text-[var(--color-dc-text)]"
              }`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-[var(--color-dc-faint)] mt-0.5">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Turnstile widget — rendered when site key is configured */}
      {turnstileSiteKey && (
        <section className="rounded-2xl border border-[var(--color-dc-border)] bg-[var(--color-dc-surface)] p-6">
          <h2 className="text-sm font-bold text-[var(--color-dc-muted)] uppercase tracking-widest mb-4">
            Human check
          </h2>
          <div
            ref={turnstileRef}
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-theme="dark"
            data-callback="onTurnstileVerify"
          />
          {/* Turnstile calls this global function on verify */}
          <script
            dangerouslySetInnerHTML={{
              __html: `window.onTurnstileVerify = function(token) {
                document.dispatchEvent(new CustomEvent('turnstile-verify', { detail: token }));
              };`,
            }}
          />
        </section>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full py-4 rounded-2xl bg-[var(--color-dc-accent)] hover:bg-[var(--color-dc-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg transition-colors shadow-lg shadow-[var(--color-dc-accent)]/25"
      >
        Drop it →
      </button>

      <p className="text-center text-xs text-[var(--color-dc-faint)]">
        Free · No login · Usually done in under 2 minutes
      </p>

      {/* Turnstile token bridge */}
      <TurnstileListener onToken={setTurnstileToken} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

/** Listens for the custom event fired by the Turnstile callback. */
function TurnstileListener({ onToken }: { onToken: (token: string) => void }) {
  useEffect(() => {
    function handler(e: Event) {
      onToken((e as CustomEvent<string>).detail);
    }
    document.addEventListener("turnstile-verify", handler);
    return () => document.removeEventListener("turnstile-verify", handler);
  }, [onToken]);
  return null;
}

/** Animated waveform bars shown during generation. */
function WaveformAnimation() {
  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-[var(--color-dc-accent)]"
          style={{
            height: "100%",
            animation: `waveBar 1.2s ease-in-out ${(i * 0.1).toFixed(1)}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.15); opacity: 0.4; }
          to   { transform: scaleY(1);    opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

const STAGE_ORDER = ["queued", "extracting", "writing_script", "synthesizing", "stitching", "done"];

/** Progress dots — one per stage, filled up to current stage. */
function StageDots({ stage }: { stage: string }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {STAGE_ORDER.slice(0, -1).map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i <= currentIdx
              ? "bg-[var(--color-dc-accent)] w-6"
              : "bg-[var(--color-dc-border)] w-3"
          }`}
        />
      ))}
    </div>
  );
}
