/**
 * Deepgram Aura (`@cf/deepgram/aura-1`) speaker catalog.
 *
 * The set is fixed by the model. Keeping it here as a const tuple lets the
 * request validator accept only real voices and gives the rest of the codebase
 * a precise `AuraVoice` type. A future two-host format can simply alternate
 * between two of these speakers — no architecture change required.
 */
export const AURA_VOICES = [
  "angus",
  "asteria",
  "arcas",
  "orion",
  "orpheus",
  "athena",
  "luna",
  "zeus",
  "perseus",
  "helios",
  "hera",
  "stella",
] as const;

export type AuraVoice = (typeof AURA_VOICES)[number];

/** Fallback voice when none is requested and no env default is configured. */
export const FALLBACK_VOICE: AuraVoice = "asteria";

export function isAuraVoice(value: string): value is AuraVoice {
  return (AURA_VOICES as readonly string[]).includes(value);
}

/** Resolve a voice from an optional request value and an optional env default. */
export function resolveVoice(
  requested: string | undefined,
  envDefault: string | undefined,
): AuraVoice {
  if (requested && isAuraVoice(requested)) return requested;
  if (envDefault && isAuraVoice(envDefault)) return envDefault;
  return FALLBACK_VOICE;
}
