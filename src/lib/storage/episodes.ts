import { NotFoundError } from "../errors";
import type { EpisodeRecord } from "../../types";

/**
 * R2-backed persistence for episodes. Layout under a single bucket:
 *
 *   episodes/{id}/meta.json        canonical episode record (small JSON)
 *   episodes/{id}/segments/{n}.mp3 per-segment audio (intermediate)
 *   episodes/{id}/audio.mp3        final stitched episode audio
 *
 * Workflow steps persist large audio blobs here and pass only small keys
 * between steps, sidestepping the Workflows 1 MiB step-result limit.
 */
export class EpisodeStore {
  constructor(private readonly bucket: R2Bucket) {}

  static metaKey(id: string): string {
    return `episodes/${id}/meta.json`;
  }
  static segmentKey(id: string, index: number): string {
    return `episodes/${id}/segments/${index}.mp3`;
  }
  static audioKey(id: string): string {
    return `episodes/${id}/audio.mp3`;
  }

  async create(record: EpisodeRecord): Promise<void> {
    await this.bucket.put(EpisodeStore.metaKey(record.id), JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async get(id: string): Promise<EpisodeRecord | null> {
    const object = await this.bucket.get(EpisodeStore.metaKey(id));
    if (!object) return null;
    return object.json<EpisodeRecord>();
  }

  /** Read-modify-write the episode record. Stamps `updatedAt`. */
  async patch(id: string, changes: Partial<EpisodeRecord>): Promise<EpisodeRecord> {
    const current = await this.get(id);
    if (!current) throw new NotFoundError(`Episode ${id} not found`);
    const next: EpisodeRecord = {
      ...current,
      ...changes,
      id: current.id,
      updatedAt: new Date().toISOString(),
    };
    await this.bucket.put(EpisodeStore.metaKey(id), JSON.stringify(next), {
      httpMetadata: { contentType: "application/json" },
    });
    return next;
  }

  async putSegment(id: string, index: number, bytes: Uint8Array): Promise<string> {
    const key = EpisodeStore.segmentKey(id, index);
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    return key;
  }

  async getSegment(id: string, index: number): Promise<Uint8Array> {
    const object = await this.bucket.get(EpisodeStore.segmentKey(id, index));
    if (!object) throw new NotFoundError(`Segment ${index} for episode ${id} not found`);
    return new Uint8Array(await object.arrayBuffer());
  }

  async putAudio(id: string, bytes: Uint8Array): Promise<{ key: string; byteLength: number }> {
    const key = EpisodeStore.audioKey(id);
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    return { key, byteLength: bytes.byteLength };
  }

  /** Fetch audio metadata (size, etag) without the body — used for HEAD and Range setup. */
  async headAudio(id: string): Promise<R2Object | null> {
    return this.bucket.head(EpisodeStore.audioKey(id));
  }

  /** Fetch the final audio object, optionally for a byte range (for seeking). */
  async getAudioObject(id: string, range?: R2Range): Promise<R2ObjectBody | null> {
    const object = await this.bucket.get(EpisodeStore.audioKey(id), range ? { range } : undefined);
    return (object as R2ObjectBody | null) ?? null;
  }

  /** Best-effort cleanup of intermediate per-segment audio after stitching. */
  async deleteSegments(id: string, count: number): Promise<void> {
    const keys = Array.from({ length: count }, (_, i) => EpisodeStore.segmentKey(id, i));
    if (keys.length > 0) await this.bucket.delete(keys);
  }
}
