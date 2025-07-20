const redis = require("redis");
const logger = require("../utils/logger");

let redisClient;

async function connectRedis() {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || "undefined",
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    redisClient.on("error", (err) => {
      logger.error("Redis client error", err);
    });

    redisClient.on("connect", () => {
      logger.info("Redis client connectd");
    });

    redisClient.on("reconnecting", () => {
      logger.info("Redis client reconnecting");
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error("Failed to connect to redis: ", error);
    throw error;
  }
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quite();
    logger.info("Redis client disconnected");
  }
}

class RedisCache {
  static async get(key) {
    try {
      const value = redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error("Redis GET error: ", error);
      throw error;
    }
  }

  static async set(key, value, ttl = 3600) {
    try {
      const stringValue = JSON.stringify(value);
      await redisClient.setEx(key, ttl, stringValue);
    } catch (error) {
      logger.error("Redis SET error: ", error);
      return false;
    }
  }

  static async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error("Redis DEL error", error);
      return false;
    }
  }

  static async exists(key) {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error("Redis EXISTS error", error);
      return false;
    }
  }

  static async keys(pattern) {
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      logger.error("Redis KEYS error", error);
      return [];
    }
  }

  static async flushPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (error) {
      logger.error("Redis FLUSH_PATTERN error: ", error);
      return false;
    }
  }

  // session management

  static async setSession(userId, sessionData, ttl = 86400) {
    const key = `session:${userId}`;
    return await this.set(key, sessionData, ttl);
  }

  static async getSession(userId) {
    const key = `session:${userId}`;
    return await this.get(key);
  }

  static async deleteSession(userId) {
    const key = `session${userId}`;
    return await this.del(key);
  }

  // user data caching
  static async cacheUserAssets(userId, assets, ttl = 1800) {
    const key = `user:${userId}:assets`;
    return await this.set(key, assets, ttl);
  }

  static async getUserAssets(userId) {
    const key = `user:${userId}:assets`;
    return await this.get(key);
  }

  static async invalidateuserCache(userId) {
    const pattern = `user:${userId}:*`;
    return await this.flushPattern(pattern);
  }

  // Processing status caching
  static async setProcessingStatus(assetId, status, ttl = 3600) {
    const key = `processing:${assetId}`;
    return await this.set(key, status, ttl);
  }

  static async getProcessingStatus(assetId) {
    const key = `processing:${assetId}`;
    return await this.get(key);
  }

  // / Search results caching
  static async cacheSearchResults(query, userId, results, ttl = 1800) {
    const key = `search:${userId}:${Buffer.from(query).toString("base64")}`;
    return await this.set(key, results, ttl);
  }

  static async getSearchResults(query, userId) {
    const key = `search:${userId}:${Buffer.from(query).toString("base64")}`;
    return await this.get(key);
  }

  // Rate limiting
  static async incrementRateLimit(key, window = 900) {
    try {
      const multi = redisClient.multi();
      multi.incr(key);
      multi.expire(key, window);
      const results = await multi.exec();
      return results[0];
    } catch (error) {
      logger.error("Redis rate limit error:", error);
      return 0;
    }
  }

  // Pub/Sub for real-time updates
  static async publish(channel, message) {
    try {
      await redisClient.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error("Redis PUBLISH error:", error);
      return false;
    }
  }

  static async subscribe(channel, callback){
    try {
      const subscriber = redisClient.duplicate();
      await subscriber.connect();

      await subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage)
        } catch (error) {
          logger.error('Redis message parse error', error);
        }
      });

      return subscriber;
    } catch (error) {
      logger.error('Redis SUBSCRIBE error: ', error);
      throw error;
    }
  }

  // Analytics and metrics
  static async recordMetric(metric, value, timestamp){
    try {
      const key = `metrics:${metric}:${timestamp}`;
      await redisClient.zAdd(key, {score: timestamp, value: value});

      // keeping only last 24 hrs metrics
      const oneDayAgo = timestamp - 86400;
      await redisClient.zRemRangeByScore(key, 0, oneDayAgo);
      return true;
    } catch (error) {
      logger.error('Redis record metric error: ', error);
      return false;
    }
  }

  static async getMetric(metric, startTime, endTime){
    try {
      const key = `metrics:${metric}:*`;
      return await redisClient.zRangeByScore(key, startTime, endTime);
    } catch (error) {
      logger.error('Redis metric retrieval error: ', error);
      return [];
    }
  }
  
}

module.exports = {
  connectRedis,
  disconnectRedis,
  RedisCache,
  redisClient: () => redisClient
};
