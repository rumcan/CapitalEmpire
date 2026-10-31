export interface Point { x: number; y: number; }
export interface Rect extends Point { width: number; height: number; }
export interface BakeRequest { key: string; [key: string]: unknown; }
export interface BunkerSprite {
  /** Cache owns this ImageBitmap after successful load or a completed bake. */
  image: ImageBitmap;
  width: number;
  height: number;
  /** Anchor in this image's pixel coordinates; caller handles world projection. */
  anchor: Point;
  worldBounds?: Rect;
  key?: string;
}
export interface CacheMetrics {
  draws: number; hits: number; misses: number; bytes: number; entries: number;
  evictions: number; bakes: number; culled: number; staleResults: number;
  evictionHookErrors: number; activeBakes: number; pendingRequests: number; queuedBakes: number;
}
export interface BunkerCacheOptions<TRequest extends {key:string} = BakeRequest, TSprite extends BunkerSprite = BunkerSprite> {
  /** Decoded ready-sprite RGBA budget. Excludes in-flight baking and driver copies. */
  maxBytes?: number;
  maxConcurrentBakes?: number;
  bake?: (request: TRequest) => Promise<TSprite> | TSprite;
  /** Called after resource release. Hook errors are counted without breaking LRU. */
  onEvict?: (id: string, sprite: TSprite, reason: 'lru' | 'replace' | 'delete' | 'dispose') => void;
}
export class StaleBakeError extends Error {}
export class BunkerCache<TRequest extends {key:string} = BakeRequest, TSprite extends BunkerSprite = BunkerSprite> {
  constructor(options?: BunkerCacheOptions<TRequest, TSprite>);
  readonly maxBytes: number;
  readonly maxConcurrentBakes: number;
  readonly metrics: Readonly<CacheMetrics>;
  /** Same id/key coalesces; a newer key rejects stale requests but keeps old pixels visible. */
  request(id: string, request: TRequest): Promise<TSprite>;
  /** Register a static prebaked sprite without configuring a baker. */
  load(id: string, sprite: TSprite): TSprite;
  /** Fetch a ready sprite for custom chunk composition and make it MRU. */
  get(id: string): TSprite | undefined;
  /** Close the owned sprite and invalidate pending versions; returns whether one existed. */
  delete(id: string): boolean;
  /** Returns true iff one drawImage was issued; culled entries do not become MRU. */
  draw(ctx: Pick<CanvasRenderingContext2D, 'drawImage'> | Pick<OffscreenCanvasRenderingContext2D, 'drawImage'>,
       id: string, x: number, y: number, scale?: number, viewport?: Rect): boolean;
  dispose(): void;
}
