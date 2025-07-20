const logger = require("../utils/logger");

class ErrorHandlerMiddleware {
  // Global error handler
  static globalErrorHandler(err, req, res, next) {
    logger.error("Global error handler:", {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      user: req.user?.id,
      timestamp: new Date().toISOString(),
    });

    // Set default error status
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";
    let details = null;

    // Handle specific error types
    switch (err.name) {
      case "ValidationError":
        statusCode = 400;
        message = "Validation Error";
        details = err.details || err.message;
        break;

      case "UnauthorizedError":
      case "JsonWebTokenError":
        statusCode = 401;
        message = "Unauthorized";
        break;

      case "TokenExpiredError":
        statusCode = 401;
        message = "Token expired";
        break;

      case "ForbiddenError":
        statusCode = 403;
        message = "Forbidden";
        break;

      case "NotFoundError":
        statusCode = 404;
        message = "Resource not found";
        break;

      case "ConflictError":
        statusCode = 409;
        message = "Conflict";
        break;

      case "TooManyRequestsError":
        statusCode = 429;
        message = "Too Many Requests";
        break;

      case "PrismaClientKnownRequestError":
        const prismaError = this.handlePrismaError(err);
        statusCode = prismaError.statusCode;
        message = prismaError.message;
        details = prismaError.details;
        break;

      case "MulterError":
        const multerError = this.handleMulterError(err);
        statusCode = multerError.statusCode;
        message = multerError.message;
        break;

      case "SyntaxError":
        if (err.message.includes("JSON")) {
          statusCode = 400;
          message = "Invalid JSON format";
        }
        break;

      default:
        // Log unexpected errors
        if (statusCode === 500) {
          logger.error("Unexpected error:", {
            error: err.message,
            stack: err.stack,
            name: err.name,
          });
        }
        break;
    }

    // Don't leak error details in production
    if (process.env.NODE_ENV === "production" && statusCode === 500) {
      message = "Internal Server Error";
      details = null;
    }

    const errorResponse = {
      error: message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
    };

    if (details) {
      errorResponse.details = details;
    }

    // Add request ID if available
    if (req.id) {
      errorResponse.requestId = req.id;
    }

    res.status(statusCode).json(errorResponse);
  }

  // Handle Prisma database errors
  static handlePrismaError(err) {
    switch (err.code) {
      case "P2002":
        return {
          statusCode: 409,
          message: "Duplicate entry",
          details: `${err.meta?.target?.join(", ")} already exists`,
        };

      case "P2014":
        return {
          statusCode: 400,
          message: "Invalid ID",
          details: "The provided ID is invalid",
        };

      case "P2003":
        return {
          statusCode: 400,
          message: "Foreign key constraint failed",
          details: "Referenced record does not exist",
        };

      case "P2025":
        return {
          statusCode: 404,
          message: "Record not found",
          details: "The requested record does not exist",
        };

      default:
        return {
          statusCode: 500,
          message: "Database error",
          details: process.env.NODE_ENV === "development" ? err.message : null,
        };
    }
  }

  // Handle Multer file upload errors
  static handleMulterError(err) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return {
          statusCode: 400,
          message: "File too large",
        };

      case "LIMIT_FILE_COUNT":
        return {
          statusCode: 400,
          message: "Too many files",
        };

      case "LIMIT_UNEXPECTED_FILE":
        return {
          statusCode: 400,
          message: "Unexpected file field",
        };

      default:
        return {
          statusCode: 400,
          message: "File upload error",
        };
    }
  }

  // 404 handler for undefined routes
  static notFoundHandler(req, res) {
    logger.warn("Route not found:", {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(404).json({
      error: "Route not found",
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
    });
  }

  // Async error wrapper
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Custom error classes
  static ValidationError = class extends Error {
    constructor(message, details = null) {
      super(message);
      this.name = "ValidationError";
      this.statusCode = 400;
      this.details = details;
    }
  };

  static UnauthorizedError = class extends Error {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "UnauthorizedError";
      this.statusCode = 401;
    }
  };

  static ForbiddenError = class extends Error {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "ForbiddenError";
      this.statusCode = 403;
    }
  };

  static NotFoundError = class extends Error {
    constructor(message = "Resource not found") {
      super(message);
      this.name = "NotFoundError";
      this.statusCode = 404;
    }
  };

  static ConflictError = class extends Error {
    constructor(message = "Conflict") {
      super(message);
      this.name = "ConflictError";
      this.statusCode = 409;
    }
  };

  static TooManyRequestsError = class extends Error {
    constructor(message = "Too Many Requests") {
      super(message);
      this.name = "TooManyRequestsError";
      this.statusCode = 429;
    }
  };

  // Health check error handler
  static healthCheckHandler(req, res) {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || "1.0.0",
    });
  }

  // Request logging middleware
  static requestLogger(req, res, next) {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        user: req.user?.id,
      };

      if (res.statusCode >= 400) {
        logger.warn("Request completed with error:", logData);
      } else {
        logger.info("Request completed:", logData);
      }
    });

    next();
  }

  // Security headers middleware
  static securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    res.removeHeader("X-Powered-By");
    next();
  }
}

module.exports = ErrorHandlerMiddleware;
