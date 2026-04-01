import { describe, it, expect } from 'vitest';
import { ConcurrencyQueue, withTimeout } from '../concurrency';

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

  it('abort() 调用后应该拒绝新的挂起任务并清空队列', async () => {
    const queue = new ConcurrencyQueue(1);
    
    // 这个任务会立即执行并占用并发份额
    const task1 = queue.run(async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'task1-done';
    });
    
    // 这两个任务会被挂起
    const task2 = queue.run(async () => 'task2-done');
    const task3 = queue.run(async () => 'task3-done');
    
    // 阻止 unhandled rejection
    task2.catch(() => {});
    task3.catch(() => {});
    
    // 中止队列
    queue.abort();
    
    // task1 已经开始执行，应该能完成 (在原有逻辑中是这样设计的)
    expect(await task1).toBe('task1-done');
    
    // 挂起的任务应该被 reject
    await expect(task2).rejects.toThrow('aborted');
    await expect(task3).rejects.toThrow('aborted');
    
    // 新加的任务也应该被直接 reject，立即 catch 阻止 unhandled
    const task4 = queue.run(async () => 'task4');
    task4.catch(() => {});
    await expect(task4).rejects.toThrow('aborted');
    
    // 检查状态
    const status = queue.getStatus();
    expect(status.aborted).toBe(true);
    expect(status.queued).toBe(0);
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
