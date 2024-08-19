export class ConcurrencyLimit {

  private readonly queue: Array<() => Promise<void>> = [];
  private active: number = 0;
  private timer?: number = undefined;

  constructor(private readonly count: number) {

  }

  async do<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (value: T) => void;
    let reject: (reason: unknown) => void;
    const promise: Promise<T> = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    this.queue.push(async () => {
      this.active += 1;
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      } finally {
        this.active -= 1;
      }
    });

    await this.processQueue();

    if (this.queue.length > 0 && this.timer === undefined) {
      this.timer = window.setInterval(this.processQueue.bind(this), 50);
    }

    return promise;
  }

  private async processQueue() {
    const promises: Array<Promise<void>> = [];

    while (this.active < this.count) {
      const task = this.queue.shift();
      if (task) {
        promises.push(task());
      } else {
        if (this.timer !== undefined) {
          window.clearInterval(this.timer);
          this.timer = undefined;
        }
        break;
      }
    }

    await Promise.allSettled(promises);
  }
}