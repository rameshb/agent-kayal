/**
 * In-memory sliding-window rate limiter.
 * Tracks action timestamps per user and rejects if over limit.
 */
export class RateLimiter {
  private windowMs: number;
  private maxActions: number;
  private windows: Map<string, number[]> = new Map();

  constructor(maxActionsPerHour: number) {
    this.windowMs = 60 * 60 * 1000; // 1 hour
    this.maxActions = maxActionsPerHour;
  }

  /**
   * Returns true if the action is allowed, false if rate-limited.
   */
  allow(userId: string): boolean {
    if (this.maxActions <= 0) return true; // disabled

    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.windows.get(userId) || [];

    // Prune expired entries
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= this.maxActions) {
      this.windows.set(userId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(userId, timestamps);
    return true;
  }

  /**
   * Remaining actions for user in current window.
   */
  remaining(userId: string): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = (this.windows.get(userId) || []).filter(
      (t) => t > cutoff
    );
    return Math.max(0, this.maxActions - timestamps.length);
  }
}
