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

  constructor(concurrencyLimit: number) {
    this.limit = Math.max(1, concurrencyLimit);
  }

  /**
   * 将任务推入执行队列
   * @param task 返回 Promise 的异步任务执行函数
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      // 队列已满，挂起等待
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      // 任务完成，如果有排队的，唤醒队列中的下一个
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }
}
