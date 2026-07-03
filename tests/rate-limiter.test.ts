import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/client/rate-limiter.js';

describe('RateLimiter token bucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consumes the full burst immediately', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1, burstSize: 3 });

    const p1 = limiter.acquire();
    const p2 = limiter.acquire();
    const p3 = limiter.acquire();

    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([undefined, undefined, undefined]);
  });

  it('makes requests beyond the burst wait until a token refills', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1, burstSize: 1 });

    await limiter.acquire();
    const pending = limiter.acquire();

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    // Yield to let the queue processor enter its sleep
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1000);
    await pending;
    expect(resolved).toBe(true);
  });

  it('refills tokens over time', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2, burstSize: 1 });

    await limiter.acquire();
    const pending = limiter.acquire();

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    // At 2 tokens/second, the next token is available after 500ms
    vi.advanceTimersByTime(500);
    await pending;
    expect(resolved).toBe(true);
  });

  it('preserves FIFO queue order as tokens refill', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1, burstSize: 1 });
    const order: number[] = [];

    const p1 = limiter.acquire().then(() => order.push(1));
    const p2 = limiter.acquire().then(() => order.push(2));
    const p3 = limiter.acquire().then(() => order.push(3));

    await p1;
    vi.advanceTimersByTime(1000);
    await p2;

    vi.advanceTimersByTime(1000);
    await p3;

    expect(order).toEqual([1, 2, 3]);
  });
});
