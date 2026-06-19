/**
 * Episode identifiers.
 *
 * IDs double as capability tokens: the public audio URL is
 * `/episodes/{id}/audio.mp3` with no auth, so the id must be unguessable.
 * We use 16 bytes (128 bits) of CSPRNG output encoded as Crockford base32,
 * which is URL-safe, case-insensitive, and avoids ambiguous characters.
 */

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Encode bytes as Crockford base32 (no padding). */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Generate a new unguessable, URL-safe episode id (26 chars / 128 bits). */
export function generateEpisodeId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ep_${encodeBase32(bytes).toLowerCase()}`;
}

/** Validate the shape of an episode id before using it in storage keys. */
export function isValidEpisodeId(id: string): boolean {
  return /^ep_[0-9a-z]{20,32}$/.test(id);
}
