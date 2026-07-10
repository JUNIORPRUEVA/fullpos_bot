import Redis from 'ioredis';

export class RedisService {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async pushJson(key: string, value: unknown, maxItems: number, ttlSeconds: number): Promise<void> {
    await this.client
      .multi()
      .lpush(key, JSON.stringify(value))
      .ltrim(key, 0, Math.max(0, maxItems - 1))
      .expire(key, ttlSeconds)
      .exec();
  }

  async getJsonList<T = unknown>(key: string, limit: number): Promise<T[]> {
    const values = await this.client.lrange(key, 0, Math.max(0, limit - 1));
    return values
      .map((value) => {
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      })
      .filter((value): value is T => value !== null)
      .reverse();
  }

  async addToSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const multi = this.client.multi().sadd(key, value);
    if (ttlSeconds) multi.expire(key, ttlSeconds);
    await multi.exec();
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
