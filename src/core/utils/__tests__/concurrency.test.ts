import { describe, it, expect } from 'vitest';
import { ConcurrencyQueue, withTimeout } from '@/core/utils/concurrency';

describe('ConcurrencyQueue', () => {
  it('应该限制同时执行的任务数量', async () => {
    const queue = new ConcurrencyQueue(2);
    let activeTasks = 0;
    let maxActive = 0;

    const createTask = () => queue.run(async () => {
      activeTasks++;
      maxActive = Math.max(maxActive, activeTasks);
      await new Promise(r => setTimeout(r, 50));
      activeTasks--;
    });

    await Promise.all([createTask(), createTask(), createTask(), createTask()]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('所有任务最终都应该执行完成', async () => {
    const queue = new ConcurrencyQueue(1);
    const results: number[] = [];

    const tasks = [1, 2, 3].map(n =>
      queue.run(async () => {
        results.push(n);
        return n;
      })
    );

    const values = await Promise.all(tasks);
    expect(values).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('并发数最小应该为 1', async () => {
    const queue = new ConcurrencyQueue(0);
    let executed = false;
    await queue.run(async () => { executed = true; });
    expect(executed).toBe(true);
  });

  it('任务抛出异常不应该阻塞队列', async () => {
    const queue = new ConcurrencyQueue(1);
    const results: string[] = [];

    const task1 = queue.run(async () => { throw new Error('fail'); }).catch(() => 'caught');
    const task2 = queue.run(async () => { results.push('ok'); return 'ok'; });

    await Promise.all([task1, task2]);
    expect(results).toEqual(['ok']);
  });
});

describe('withTimeout', () => {
  it('在超时前完成应该返回正常结果', async () => {
    const result = await withTimeout(Promise.resolve('hello'), 1000);
    expect(result).toBe('hello');
  });

  it('超时后没有 fallback 应该抛出错误', async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 5000));
    await expect(withTimeout(slowPromise, 10)).rejects.toThrow('timed out');
  });

  it('超时后有 fallback 应该返回 fallback 值', async () => {
    const slowPromise = new Promise<string>(resolve =>
      setTimeout(() => resolve('too late'), 5000)
    );
    const result = await withTimeout(slowPromise, 10, 'fallback');
    expect(result).toBe('fallback');
  });

  it('原始 Promise 报错应该正常传播', async () => {
    const failPromise = Promise.reject(new Error('original error'));
    await expect(withTimeout(failPromise, 1000)).rejects.toThrow('original error');
  });
});
