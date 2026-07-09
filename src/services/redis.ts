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
}
