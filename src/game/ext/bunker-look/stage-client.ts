import StageWorker from './stage.worker.js?worker';
import type { BunkerStageRequest, BunkerStageSprite } from './stage-types';

/** One edit worker with reusable materials (cached by texture id)/mesh; frame and camera code never call this class. */
export class BunkerStageBaker {
  private readonly worker: Worker;
  private readonly jobs = new Map<number, { resolve(value: BunkerStageSprite): void; reject(error: unknown): void }>();
  private next = 1;
  private closed = false;
  constructor(workerFactory: () => Worker = () => new StageWorker()) {
    this.worker = workerFactory();
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; error?: string; sprite?: BunkerStageSprite }>) => {
      const job = this.jobs.get(data.id); if (!job) { data.sprite?.image.close(); return; }
      this.jobs.delete(data.id);
      if (data.error || !data.sprite) job.reject(new Error(data.error ?? 'Bunker worker returned no staged image.')); else job.resolve(data.sprite);
    };
    this.worker.onerror = event => this.fail(new Error(event.message || 'Bunker stage worker failed.'));
    this.worker.onmessageerror = () => this.fail(new Error('Bunker stage worker message could not be decoded.'));
  }
  bake(request: BunkerStageRequest): Promise<BunkerStageSprite> {
    if (this.closed) return Promise.reject(new Error('Bunker stage baker is disposed.'));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      try { this.worker.postMessage({ t: 'bake', id, request }); }
      catch (error) { this.jobs.delete(id); reject(error); }
    });
  }
  private fail(error: Error) { if (this.closed) return; this.closed = true; for (const job of this.jobs.values()) job.reject(error); this.jobs.clear(); this.worker.terminate(); }
  dispose(): void { this.fail(new Error('Bunker stage baker is disposed.')); }
}
