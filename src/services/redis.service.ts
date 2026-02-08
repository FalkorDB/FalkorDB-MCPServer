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

  async initialize(): Promise<void> {
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = this._initialize();

    try {
      await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  private async _initialize(): Promise<void> {
    try {
      logger.info('Attempting to connect to Redis', {
        url: config.redis.url,
        attempt: this.retryCount + 1
      });

      this.client = createClient({
        url: config.redis.url,
        username: config.redis.username,
        password: config.redis.password,
      });

      await this.client.connect();
      await this.client.ping();

      logger.info('Successfully connected to Redis');
      this.retryCount = 0;
    } catch (error) {
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.warn('Failed to connect to Redis, retrying...', {
          attempt: this.retryCount,
          maxRetries: this.maxRetries,
          error: error instanceof Error ? error.message : String(error)
        });

        await new Promise(resolve => setTimeout(resolve, 5000));
        return this._initialize();
      } else {
        const appError = new AppError(
          CommonErrors.CONNECTION_FAILED,
          `Failed to connect to Redis after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
          true
        );
        
        logger.error('Redis connection failed permanently', appError);
        throw appError;
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
      
      logger.error('Redis GET operation failed', appError, { key });
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
      
      logger.error('Redis SET operation failed', appError, { key });
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
      
      logger.error('Redis DEL operation failed', appError, { key });
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

      logger.error('Redis KEYS operation failed', appError);
      throw appError;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis connection closed successfully');
      } catch (error) {
        logger.error('Error closing Redis connection', error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.client = null;
        this.retryCount = 0;
      }
    }
  }
}

export const redisService = new RedisService();