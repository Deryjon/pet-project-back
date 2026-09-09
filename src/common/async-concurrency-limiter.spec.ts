import { AsyncConcurrencyLimiter } from './async-concurrency-limiter';

describe('AsyncConcurrencyLimiter', () => {
  it('never runs more than the configured number of tasks', async () => {
    const limiter = new AsyncConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const tasks = Array.from({ length: 4 }, (_, index) =>
      limiter.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return index;
      }),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(active).toBe(2);
    releases.splice(0, 2).forEach((release) => release());
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(active).toBe(2);
    releases.splice(0).forEach((release) => release());
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
});
