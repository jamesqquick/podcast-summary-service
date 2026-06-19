import { ExtractionError } from "../errors";
import { clampText, extractReadable } from "./html-to-text";

/** Readable content extracted from a single link. */
export interface ExtractedLink {
  url: string;
  title: string;
  text: string;
}

export interface ExtractOptions {
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Max characters of body text to keep per link. */
  maxChars?: number;
}

/**
 * Strategy interface for turning a URL into readable text. The fetch-based
 * implementation below covers static and server-rendered pages; a
 * Browser-Rendering-backed implementation can be dropped in later for
 * JavaScript-heavy sites without touching the workflow.
 */
export interface LinkExtractor {
  extract(url: string, options?: ExtractOptions): Promise<ExtractedLink>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 12_000;
const MIN_USABLE_CHARS = 200;

/** A browser-like UA — some sites return empty/blocked bodies to unknown agents. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; PodcastSummaryBot/1.0; +https://github.com/jamesqquick/podcast-summary-service)";

export class FetchLinkExtractor implements LinkExtractor {
  async extract(url: string, options: ExtractOptions = {}): Promise<ExtractedLink> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

    const response = await this.fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      throw new ExtractionError(url, `Fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      throw new ExtractionError(url, `Unsupported content type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    const { title, text } = extractReadable(html);
    const clamped = clampText(text, maxChars);

    if (clamped.length < MIN_USABLE_CHARS) {
      throw new ExtractionError(url, "Page yielded too little readable text");
    }

    return { url, title: title || hostnameOf(url), text: clamped };
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === "AbortError" ? "timed out" : "failed";
      throw new ExtractionError(url, `Fetch ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
