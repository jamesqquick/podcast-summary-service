/**
 * Concatenate per-segment MP3 byte buffers into a single episode MP3.
 *
 * Aura returns raw MP3 frame data (no container). MP3 is a sequence of
 * self-describing frames, so byte-concatenating segments produces a valid file
 * that standard players (browsers, podcast apps) decode and play through
 * seamlessly — players resynchronize on each frame header. This is the pragmatic
 * approach for v1; a future enhancement could re-mux for perfectly clean frame
 * boundaries. Pure and synchronous for easy testing.
 */
export function concatenateMp3(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}
