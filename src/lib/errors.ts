/**
 * Domain-specific error types.
 *
 * API-facing errors extend {@link HttpError} so the HTTP layer can map them to
 * a status code and a stable machine-readable `code` without leaking internals.
 * Pipeline errors (extraction, script, speech) are thrown inside Workflow steps
 * and surfaced on the episode record.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends HttpError {
  constructor(
    message: string,
    readonly issues?: unknown,
  ) {
    super(400, "validation_error", message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Missing or invalid API token") {
    super(401, "unauthorized", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found") {
    super(404, "not_found", message);
  }
}

/** A link could not be fetched or yielded too little readable content. */
export class ExtractionError extends Error {
  constructor(
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** The language model failed to produce a usable script. */
export class ScriptGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptGenerationError";
  }
}

/** The text-to-speech model failed to produce audio for a segment. */
export class SpeechSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechSynthesisError";
  }
}
