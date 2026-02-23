import { createClient } from 'redis';
import { config } from '../config/index.js';
import { AppError, CommonErrors } from '../errors/AppError.js';
import { logger } from './logger.service.js';

class RedisService {
  private client: ReturnType<typeof createClient> | null = null;
  private readonly maxRetries = 5;
  private retryCount = 0;
  private initializingPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize in constructor - use explicit initialization
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = parsed.username ? '***' : '';
        parsed.password = parsed.password ? '***' : '';
      }
      return parsed.toString();
    } catch {
      return '<invalid-url>';
    }
  }

  async initialize(): Promise<void> {
    // Idempotency guard: don't overwrite an already-connected client
    if (this.client) {
      return;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.retryCount = 0;
    this.initializingPromise = this._initialize();

    try {
      await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  private async _initialize(): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Fire-and-forget: non-critical connection attempt log
        logger.info('Attempting to connect to Redis', {
          url: this.sanitizeUrl(config.redis.url),
          attempt: attempt + 1
        });

        this.client = createClient({
          url: config.redis.url,
          ...(config.redis.username && { username: config.redis.username }),
          ...(config.redis.password && { password: config.redis.password }),
        });

        await this.client.connect();
        await this.client.ping();

        // Fire-and-forget: non-critical success log
        logger.info('Successfully connected to Redis');
        this.retryCount = 0;
        return;
      } catch (error) {
        // Clean up failed client before retrying or throwing
        if (this.client) {
          try {
            await this.client.disconnect();
          } catch {
            // Ignore disconnect errors
          }
          this.client = null;
        }

        if (attempt < this.maxRetries) {
          this.retryCount = attempt + 1;
          const delay = Math.min(5000 * 2 ** attempt, 30000) + Math.random() * 1000;
          // Fire-and-forget: non-critical retry log
          logger.warn('Failed to connect to Redis, retrying...', {
            attempt: this.retryCount,
            maxRetries: this.maxRetries,
            nextRetryMs: Math.round(delay),
            error: error instanceof Error ? error.message : String(error)
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          const appError = new AppError(
            CommonErrors.CONNECTION_FAILED,
            `Failed to connect to Redis after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
            true
          );

          await logger.error('Redis connection failed permanently', appError);
          throw appError;
        }
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new AppError(
        CommonErrors.CONNECTION_FAILED,
        'Redis client not initialized. Call initialize() first.',
        true
      );
    }

    try {
      const value = await this.client.get(key);
      logger.debug('Redis GET operation completed', { key, hasValue: value !== null });
      return value;
    } catch (error) {
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        `Failed to get key '${key}' from Redis: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      
      await logger.error('Redis GET operation failed', appError, { key });
      throw appError;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) {
      throw new AppError(
        CommonErrors.CONNECTION_FAILED,
        'Redis client not initialized. Call initialize() first.',
        true
      );
    }

    try {
      await this.client.set(key, value);
      logger.debug('Redis SET operation completed', { key });
    } catch (error) {
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        `Failed to set key '${key}' in Redis: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      
      await logger.error('Redis SET operation failed', appError, { key });
      throw appError;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new AppError(
        CommonErrors.CONNECTION_FAILED,
        'Redis client not initialized. Call initialize() first.',
        true
      );
    }

    try {
      await this.client.del(key);
      logger.debug('Redis DEL operation completed', { key });
    } catch (error) {
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        `Failed to delete key '${key}' from Redis: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      
      await logger.error('Redis DEL operation failed', appError, { key });
      throw appError;
    }
  }

  async listKeys(): Promise<string[]> {
    if (!this.client) {
      throw new AppError(
        CommonErrors.CONNECTION_FAILED,
        'Redis client not initialized. Call initialize() first.',
        true
      );
    }

    try {
      let cursor = 0;
      const allKeys: string[] = [];

      do {
        const result = await this.client.scan(cursor, {
          MATCH: '*',
          COUNT: 1000
        });

        allKeys.push(...result.keys);

        // Depending on the redis client, cursor may be a string; normalize to number
        cursor = typeof result.cursor === 'string' ? Number(result.cursor) : result.cursor;
      } while (cursor !== 0);

      logger.debug('Redis KEYS operation completed', { count: allKeys.length });
      return allKeys;
    } catch (error) {
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        `Failed to list keys in Redis: ${error instanceof Error ? error.message : String(error)}`,
        true
      );

      await logger.error('Redis KEYS operation failed', appError);
      throw appError;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis connection closed successfully');
      } catch (error) {
        // Fire-and-forget: best-effort log during cleanup
        logger.error('Error closing Redis connection', error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.client = null;
        this.retryCount = 0;
      }
    }
  }
}

export const redisService = new RedisService();