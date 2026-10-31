/**
 * Runtime-only, owned ImageBitmap cache. No terrain, shader, worker, or DOM imports.
 * x/y in draw() identify the sprite anchor in screen coordinates.
 */
export class StaleBakeError extends Error {
  constructor(message = 'Bunker bake was superseded or the cache was disposed.') {
    super(message); this.name = 'StaleBakeError';
  }
}

export class BunkerCache {
  constructor({maxBytes = 32 * 1024 * 1024, maxConcurrentBakes = 1, bake, onEvict} = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes must be a nonnegative safe integer.');
    if (!Number.isSafeInteger(maxConcurrentBakes) || maxConcurrentBakes < 1) throw new RangeError('maxConcurrentBakes must be a positive integer.');
    if (bake !== undefined && typeof bake !== 'function') throw new TypeError('bake must be a function.');
    if (onEvict !== undefined && typeof onEvict !== 'function') throw new TypeError('onEvict must be a function.');
    this.maxBytes = maxBytes; this.maxConcurrentBakes = maxConcurrentBakes;
    this._bake = bake; this._onEvict = onEvict; this._entries = new Map(); this._jobs = new Map();
    this._queue = []; this._active = 0; this._bytes = 0; this._disposed = false;
    this._imageReferences = new Map(); this._closedImages = new WeakSet();
    this._stats = {draws: 0, hits: 0, misses: 0, evictions: 0, bakes: 0, culled: 0, staleResults: 0, evictionHookErrors: 0};
  }

  get metrics() {
    return {...this._stats, bytes: this._bytes, entries: this._entries.size,
            activeBakes: this._active, pendingRequests: this._jobs.size,
            queuedBakes: this._queue.filter(job => !job.stale).length};
  }

  /** Same id + request.key shares the same pending promise or ready sprite. */
  request(id, request) {
    this._assertId(id);
    if (this._disposed) return Promise.reject(new Error('BunkerCache is disposed.'));
    if (!request || typeof request.key !== 'string' || !request.key) return Promise.reject(new TypeError('request.key must be a nonempty version/hash string.'));
    const entry = this._entries.get(id);
    if (entry?.key === request.key) {
      this._stats.hits++; this._touch(id, entry);
      // A request for the old ready version also supersedes a different pending edit.
      this._invalidate(id);
      return Promise.resolve(entry.sprite);
    }
    const pending = this._jobs.get(id);
    if (pending?.key === request.key && !pending.stale) {this._stats.hits++; return pending.promise;}
    this._stats.misses++;
    if (!this._bake) return Promise.reject(new Error('No baker configured. Register prebaked sprites with load().'));
    this._invalidate(id);
    let resolve, reject;
    const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
    // Consumers can fire-and-forget an edit without an unhandled stale rejection;
    // awaiting the original promise still receives the rejection normally.
    promise.catch(() => {});
    const job = {id, key: request.key, request, promise, resolve, reject, stale: false, settled: false};
    this._jobs.set(id, job); this._queue.push(job); this._pump();
    return promise;
  }

  /** Register a static/prebaked sprite. Ownership transfers only on success. */
  load(id, sprite) {
    this._assertAlive(); this._assertId(id);
    const installed = this._install(id, sprite, sprite?.key || `static:${id}`);
    this._invalidate(id);
    return installed;
  }

  /** Fetch a ready sprite for a custom compositor and mark it most recently used. */
  get(id) {
    this._assertAlive(); this._assertId(id);
    const entry = this._entries.get(id);
    if (!entry) {this._stats.misses++; return undefined;}
    this._stats.hits++; this._touch(id, entry); return entry.sprite;
  }

  /** Remove owned pixels immediately and invalidate any queued/in-flight version. */
  delete(id) {
    this._assertAlive(); this._assertId(id);
    const existed = this._entries.has(id) || this._jobs.has(id);
    this._invalidate(id); this._remove(id, 'delete'); return existed;
  }

  /** Returns true only when one drawImage was issued; culling never draws. */
  draw(ctx, id, x, y, scale = 1, viewport) {
    this._assertAlive();
    if (![x, y, scale].every(Number.isFinite) || scale <= 0) throw new RangeError('Draw coordinates must be finite and scale must be positive.');
    const entry = this._entries.get(id);
    if (!entry) {this._stats.misses++; return false;}
    this._stats.hits++;
    const sprite = entry.sprite, left = x - sprite.anchor.x * scale, top = y - sprite.anchor.y * scale;
    const width = sprite.width * scale, height = sprite.height * scale;
    if (viewport) {
      if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
          || viewport.width < 0 || viewport.height < 0) throw new RangeError('viewport must be a finite x/y/width/height rectangle.');
      if (left >= viewport.x + viewport.width || top >= viewport.y + viewport.height
          || left + width <= viewport.x || top + height <= viewport.y) {this._stats.culled++; return false;}
    }
    this._touch(id, entry);
    ctx.drawImage(sprite.image, left, top, width, height);
    this._stats.draws++;
    return true;
  }

  /** Invalidates pending work; eventual in-flight results are closed, not stored. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const id of [...this._jobs.keys()]) this._invalidate(id);
    this._queue.length = 0;
    for (const id of [...this._entries.keys()]) this._remove(id, 'dispose');
  }

  _assertAlive() {if (this._disposed) throw new Error('BunkerCache is disposed.');}
  _assertId(id) {if (typeof id !== 'string' || !id) throw new TypeError('id must be a nonempty string.');}
  _touch(id, entry) {this._entries.delete(id); this._entries.set(id, entry);}
  _retain(image) {this._imageReferences.set(image, (this._imageReferences.get(image) || 0) + 1);}
  _close(image) {
    if (!image || typeof image !== 'object' || this._imageReferences.has(image) || this._closedImages.has(image)) return;
    this._closedImages.add(image);
    if (typeof image.close === 'function') image.close();
  }
  _release(image) {
    const count = this._imageReferences.get(image) || 0;
    if (count > 1) this._imageReferences.set(image, count - 1);
    else {this._imageReferences.delete(image); this._close(image);}
  }
  _remove(id, reason) {
    const entry = this._entries.get(id); if (!entry) return;
    this._entries.delete(id); this._bytes -= entry.bytes; this._release(entry.sprite.image);
    if (reason === 'lru') this._stats.evictions++;
    if (this._onEvict) {try {this._onEvict(id, entry.sprite, reason);} catch {this._stats.evictionHookErrors++;}}
  }
  _normalize(sprite, key) {
    if (!sprite || !sprite.image || typeof sprite.image !== 'object') throw new TypeError('A sprite must contain an owned image.');
    if (![sprite.width, sprite.height].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError('Sprite dimensions must be positive safe integers.');
    if ((typeof sprite.image.width === 'number' && sprite.image.width !== sprite.width)
        || (typeof sprite.image.height === 'number' && sprite.image.height !== sprite.height)) {
      throw new RangeError('Sprite metadata must match the ImageBitmap pixel dimensions.');
    }
    if (!sprite.anchor || ![sprite.anchor.x, sprite.anchor.y].every(Number.isFinite)) throw new TypeError('Sprite anchor must contain finite x/y coordinates.');
    if (this._closedImages.has(sprite.image)) throw new Error('Cannot load an image already closed by this cache.');
    const bytes = sprite.width * sprite.height * 4;
    if (!Number.isSafeInteger(bytes) || bytes > this.maxBytes) throw new RangeError('Sprite exceeds the decoded RGBA cache budget.');
    return {sprite: Object.freeze({...sprite, key, anchor: Object.freeze({...sprite.anchor})}), bytes};
  }
  _install(id, sprite, key) {
    const next = this._normalize(sprite, key);
    // Retaining first also handles a caller reusing the same ImageBitmap across
    // entries or replacing a sprite while keeping its existing image resource.
    this._retain(next.sprite.image);
    this._remove(id, 'replace');
    while (this._bytes + next.bytes > this.maxBytes) this._remove(this._entries.keys().next().value, 'lru');
    this._entries.set(id, {...next, key}); this._bytes += next.bytes;
    return next.sprite;
  }
  _reject(job, error) {if (!job.settled) {job.settled = true; job.reject(error);}}
  _invalidate(id) {
    const job = this._jobs.get(id); if (!job) return;
    job.stale = true; this._jobs.delete(id);
    const queued = this._queue.indexOf(job); if (queued >= 0) this._queue.splice(queued, 1);
    this._reject(job, new StaleBakeError());
  }
  _pump() {
    while (!this._disposed && this._active < this.maxConcurrentBakes && this._queue.length) {
      const job = this._queue.shift();
      if (job.stale || this._jobs.get(job.id) !== job) continue;
      this._active++; this._stats.bakes++;
      this._run(job);
    }
  }
  async _run(job) {
    let result, installed = false;
    try {
      result = await this._bake(job.request);
      if (this._disposed || job.stale || this._jobs.get(job.id) !== job) {
        this._stats.staleResults++; this._close(result?.image); this._reject(job, new StaleBakeError()); return;
      }
      const sprite = this._install(job.id, result, job.key); installed = true;
      job.settled = true; job.resolve(sprite);
    } catch (error) {
      if (!installed) this._close(result?.image);
      this._reject(job, error);
    } finally {
      if (this._jobs.get(job.id) === job) this._jobs.delete(job.id);
      this._active--; this._pump();
    }
  }
}
