const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const databaseManager = require('../utils/database');


class AuthMiddleware {
  // verify JWT token
  static async verifyToken(req, res, next) {
    try {
      const token = req.header("Authorization")?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({
          error: "Access denied. No token provided.",
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await databaseManager.getInstance().user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!user) {
        return res.status(401).json({
          error: "Invalid token. User not found",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error("Token verification failed: ", error);
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "Invalid token",
        });
      }

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Token expired",
        });
      }

      return res.status(500).json({
        error: "Token verification failed.",
      });
    }
  }

  // Optional authentication (for routes that work with/without auth)
  static async optionalAuth(req, res, next) {
    try {
      const token = req.header("Authorization")?.replace("Bearer ", "");

      if (!token) {
        req.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await databaseManager.getInstance().user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      req.user = user;
      next();
    } catch (error) {
      logger.warn("Optional auth failed:", error);
      req.user = null;
      next();
    }
  }

  //   Generate JWT token
  static generateToken(payload, expiresIn = "24h") {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
  }

  //   generate refesh token
  static generateRefreshToken(payload) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
  }

  // Verify refresh token
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  // Extract user ID from token without verification (for logging)
  static extractUserIdFromToken(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded?.userId || null;
    } catch (error) {
      return null;
    }
  }
}

module.exports =  AuthMiddleware;