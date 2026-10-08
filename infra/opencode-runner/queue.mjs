import { RunnerError } from './cli.mjs';

/** Bounded FIFO. Queued cancellation removes the task before it can start. */
export class InferenceQueue {
  constructor({ concurrency = 2, capacity = 16 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8
      || !Number.isInteger(capacity) || capacity < 0 || capacity > 128) throw new Error('Invalid runner capacity.');
    this.concurrency = concurrency; this.capacity = capacity; this.active = 0; this.pending = [];
  }
  submit(work, signal) {
    if (signal?.aborted) return Promise.reject(new RunnerError('cancelled', 'Inference was cancelled.'));
    if (this.active >= this.concurrency && this.pending.length >= this.capacity) {
      return Promise.reject(new RunnerError('queue_full', 'The free runner is busy. Try again shortly.'));
    }
    return new Promise((resolve, reject) => {
      const task = { work, resolve, reject, signal };
      task.abort = () => {
        const index = this.pending.indexOf(task);
        if (index >= 0) { this.pending.splice(index, 1); reject(new RunnerError('cancelled', 'Inference was cancelled.')); }
      };
      signal?.addEventListener('abort', task.abort, { once: true });
      this.pending.push(task); this.drain();
    });
  }
  drain() {
    while (this.active < this.concurrency && this.pending.length) {
      const task = this.pending.shift(); task.signal?.removeEventListener('abort', task.abort);
      if (task.signal?.aborted) { task.reject(new RunnerError('cancelled', 'Inference was cancelled.')); continue; }
      this.active++;
      Promise.resolve().then(task.work).then(task.resolve, task.reject).finally(() => { this.active--; this.drain(); });
    }
  }
  status() { return { active: this.active, queued: this.pending.length, concurrency: this.concurrency, capacity: this.capacity }; }
}
