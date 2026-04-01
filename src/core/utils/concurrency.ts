/**
 * 为 Promise 增加超时控制
 * @param promise 原始Promise
 * @param ms 超时毫秒数
 * @param fallback 超时后的默认返回值。如果不提供，则抛出 Timeout Error
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback?: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallback !== undefined) {
        resolve(fallback);
      } else {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * 并发控制队列
 * 用于限制同时进行的网络请求（如死链检测）数量
 */
export class ConcurrencyQueue {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  private limit: number;
  private aborted = false;

  constructor(concurrencyLimit: number) {
    this.limit = Math.max(1, concurrencyLimit);
  }

  abort(): void {
    this.aborted = true;
    // 清空等待队列，并唤醒所有等待者（唤醒后由于 aborted=true 会直接抛错退出）
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }

  getStatus(): { active: number; queued: number; aborted: boolean } {
    return { active: this.activeCount, queued: this.queue.length, aborted: this.aborted };
  }

  /**
   * 将任务推入执行队列
   * @param task 返回 Promise 的异步任务执行函数
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.aborted) {
      throw new Error('ConcurrencyQueue has been aborted');
    }

    if (this.activeCount >= this.limit) {
      // 队列已满，挂起等待
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    if (this.aborted) {
      throw new Error('ConcurrencyQueue has been aborted');
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      // 任务完成，如果有排队的，唤醒队列中的下一个
      if (this.queue.length > 0 && !this.aborted) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }
}

/**
 * 将数组按指定大小分块
 * @param arr 原始数组
 * @param size 每块的大小
 * @returns 分块后的二维数组
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
