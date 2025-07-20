const rateLimit = require('express-rate-limit');
const redisStore = require('rate-limit-redis');
const redis = require('../utils/redis');
const logger = require('../utils/logger');

class RateLimiterMiddleware {
  // General api rate limmiting
  static createGeneralLimiter() {
    return rateLimit({
      store: new redisStore.RedisStore({
        client: redis,
        prefix: "rl:general",
      }),
      windowMs: 15 * 60 * 1000, // 15 minute
      max: 100, // limiting each ip to 100 requests per windowMs,
      message: {
        error: "Too many requests from this IP, please try again later",
        retryAfter: 15 * 60 * 1000,
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn(`Rate limit exceeded for the IP: ${req.ip}`);
        res.status(429).json({
          error: "To many requests, please try again later",
          retryAfter: rq.rateLimit.resetTime,
        });
      },
    });
  }

  static createAuthLimiter() {
    return rateLimit({
      store: new redisStore.RedisStore({
        client: redis,
        prefix: "rl:auth",
      }),
      windowMs: 15 * 60 * 100,
      max: 5, //limit each ip to 100 requests per windowMs
      message: {
        error: "To many requests from this IP, please try again later.",
        retryAfter: 15 * 60 * 1000,
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn(`Rate limit exceeded for the IP: ${req.ip}`);
        res.status(429).json({
          error: "To many requests, please try again later.",
          retryAfter: req.rateLimit.resetTime,
        });
      },
    });
  }

  static createSearchLimiter() {
    return rateLimit({
      store: new redisStore({
        client: redis,
        prefix: "rl:search",
      }),
      windowMs: 1 * 60 * 1000,
      max: 30,
      message: {
        error: "To many search requests, please try again later.",
        retryAfter: 1 * 60 * 1000,
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn(`Search rate limit exceeded for ip: ${req.ip}`);
        req.status(429).json({
          error: `To many search requests, please try again later.`,
          retryAfter: req.rateLimit.resetTime,
        });
      },
    });
  }

  static createUserLimiter(windowMs = 15 * 60 * 100, max = 200) {
    return rateLimit({
      store: new redisStore({
        client: redis,
        prefix: "rl:user",
      }),
      windowMs,
      max,
      keyGenerator: (req) => {
        return req.user?.id || req.ip;
      },
      message: {
        error: "To many requests, please try again later.",
        retryAfter: windowMs,
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        const identifier = req.user?.id || req.ip;
        logger.warn(`User rate limit exceeded for: ${identifier}`);
        res.status(429).json({
          error: "Too many requests, please try again later.",
          retryAfter: req.rateLimit.resetTime,
        });
      },
    });
  }

  // Dynamic rate limiting based on user tier/subscription
  static createDynamicLimiter() {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return next();
        }

        // Get user's subscription tier (implement based on your user model)
        const user = await databaseManager.getInstance().user.findUnique({
          where: { id: userId },
          select: { subscription_tier: true },
        });

        // Define limits based on tier
        const tierLimits = {
          free: { windowMs: 15 * 60 * 1000, max: 50 },
          premium: { windowMs: 15 * 60 * 1000, max: 200 },
          enterprise: { windowMs: 15 * 60 * 1000, max: 1000 },
        };

        const tier = user?.subscription_tier || "free";
        const limits = tierLimits[tier];

        const limiter = rateLimit({
          store: new RedisStore({
            client: redis,
            prefix: `rl:tier:${tier}:`,
          }),
          windowMs: limits.windowMs,
          max: limits.max,
          keyGenerator: (req) => req.user.id,
          message: {
            error: `Rate limit exceeded for ${tier} tier. Please upgrade or try again later.`,
            retryAfter: limits.windowMs,
          },
          standardHeaders: true,
          legacyHeaders: false,
          handler: (req, res) => {
            logger.warn(
              `Tier rate limit exceeded for user: ${req.user.id} (${tier})`
            );
            res.status(429).json({
              error: `Rate limit exceeded for ${tier} tier. Please upgrade or try again later.`,
              retryAfter: req.rateLimit.resetTime,
              tier,
            });
          },
        });

        return limiter(req, res, next);
      } catch (error) {
        logger.error("Dynamic rate limiting failed:", error);
        return next();
      }
    };
  }

  // Custom rate limiting for specific endpoints
  static createCustomLimiter(options = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000,
      max: 100,
      prefix: "rl:custom:",
      message: "Too many requests, please try again later.",
    };

    const config = { ...defaultOptions, ...options };

    return rateLimit({
      store: new RedisStore({
        client: redis,
        prefix: config.prefix,
      }),
      windowMs: config.windowMs,
      max: config.max,
      message: {
        error: config.message,
        retryAfter: config.windowMs,
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn(`Custom rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: config.message,
          retryAfter: req.rateLimit.resetTime,
        });
      },
    });
  }
}

module.exports = RateLimiterMiddleware;