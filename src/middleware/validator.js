const { z, ZodError } = require("zod");
const logger = require("../utils/logger");
const { refreshToken } = require("../services/authService");

class ValidatorMiddleware {
  // generic validation middleware
  static validate(schema, source = "body") {
    return (req, res, next) => {
      const data = req[source];

      try {
        const parsed = schema.parse(data);
        req[source] = parsed;
        next();
      } catch (err) {
        if (err instanceof ZodError) {
          const errorMessages = err.errors.map((detail) => ({
            field: detail.path.join("."),
            message: detail.message,
          }));

          logger.warn("Validation failed: ", {
            errors: errorMessages,
            source,
            ip: req.ip,
            user: req.user?.id,
          });

          return res.status(400).json({
            error: "Validation failed",
            details: errorMessages,
          });
        }

        logger.error("Unexpected validation error:", err);
        return res.status(500).json({ error: "Internal validation error" });
      }
    };
  }

  static validUserRegistration() {
    const schema = z.object({
      email: z.string().email("Please provide a valid email address"),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters long")
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
          "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character"
        ),
      firstName: z
        .string()
        .min(2, "First name must be at least 2 characters long")
        .max(50, "First name cannot exceed more than 50 characters"),
      lastName: z
        .string()
        .min(2, "Last name must be at least 2 characters long")
        .max(50, "Last name cannot exceed more than 50 characters"),
    });

    return this.validate(schema);
  }

  static validateUserLogin() {
    const schema = z.object({
      email: z.string().email("Please provide a valid email address"),
      password: z.string().min(1, "Password is required"),
    });

    return this.validate(schema);
  }

  static validateForgotPassword() {
    const schema = z.object({
      email: z.string().email("Please provide a valid email address"),
    });
    return ValidatorMiddleware.validate(schema);
  }

  static validateResetPassword() {
    const schema = z.object({
      token: z.string().min(1, "Reset token is required"),
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters long")
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
          "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
        ),
    });
    return ValidatorMiddleware.validate(schema);
  }

  static validateOTPRequest() {
    const schema = z
      .object({
        contactMethod: z.string(),
        email: z.string().email().optional(),
        phone: z
          .string()
          .regex(
            /^\+\d{1,3}\d{7,14}$/,
            "Phone must be 10 digit long and must include country code (e.g. +919876543210) "
          )
          .optional(),
      })
      .refine((data) => data.email || data.phone, {
        message: "Either email or phone is required",
      });

    return ValidatorMiddleware.validate(schema);
  }

  static validateOTPVerify() {
    const schema = z
      .object({
        contactMethod: z.string(),
        email: z.string().email().optional(),
        phone: z
          .string()
          .regex(
            /^\+\d{1,3}\d{7,14}$/,
            "Phone must be 10 digit long and must include country code (e.g. +919876543210) "
          )
          .optional(),
        otp: z
          .string()
          .length(6, "OTP must be exactly 6 digits")
          .regex(/^\d{6}$/, "OTP must be numeric"),
      })
      .refine((data) => data.email || data.phone, {
        message: "Either email or phone is required",
      });

    return ValidatorMiddleware.validate(schema);
  }

  static validateChangePassword() {
    const schema = z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters long")
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
          "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
        ),
    });
    return ValidatorMiddleware.validate(schema);
  }

  static validateAssetUpload() {
    const schema = z.object({
      title: z
        .string()
        .min(1, "Title cannot be empty")
        .max(200, "Title cannot exceed more than 200 characters"),
      type: z.enum(["document", "video", "image", "article", "tweet"], {
        errorMap: () => ({
          message:
            "Type must be one of: document, video, image, article, tweet",
        }),
      }),
      url: z.string().url("Please provide a valid URL").optional(),
      tags: z
        .array(z.string().min(1).max(50))
        .max(10, "Maximum 10 tags allowed")
        .optional(),
      metadata: z.record(z.any()).optional(),
    });

    return this.validate(schema);
  }

  static validateSearch() {
    const schema = z.object({
      q: z
        .string()
        .min(1, "Search query cannot be empty")
        .max(500, "Search query cannot exceed 500 characters"),
      type: z
        .enum(["document", "video", "image", "article", "tweet"])
        .optional(),
      tags: z.array(z.string()).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      offset: z.coerce.number().int().min(0).default(0),
      sort: z
        .enum(["created_at", "updated_at", "title", "relevance"])
        .default("relevance")
        .optional(),
      order: z.enum(["asc", "desc"]).default("desc").optional(),
    });

    return this.validate(schema, "query");
  }

  static validateAnalysisQuery() {
    const schema = z.object({
      query: z
        .string()
        .min(10, "Query must be at least 10 characters long")
        .max(1000, "Query cannot exceed 1000 characters"),
      asset_ids: z
        .array(z.string().uuid("Invalid asset ID format"))
        .min(1)
        .max(50)
        .optional(),
      include_all_assets: z.boolean().default(false).optional(),
      max_results: z.number().int().min(1).max(100).default(10).optional(),
    });

    return this.validate(schema);
  }

  static validatePagination() {
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      sort: z.string().optional(),
      order: z.enum(["asc", "desc"]).default("desc").optional(),
    });

    return this.validate(schema, "query");
  }

  static validateUUID(paramName = "id") {
    const schema = z.object({
      [paramName]: z.string().uuid(`Invalid ${paramName} format`),
    });

    return this.validate(schema, "params");
  }

  static validateAssetUpdate() {
    const schema = z.object({
      title: z
        .string()
        .min(1, "Title cannot be empty")
        .max(200, "Title cannot exceed 200 characters")
        .optional(),
      tags: z
        .array(z.string().min(1).max(50))
        .max(10, "Maximum 10 tags allowed")
        .optional(),
      metadata: z.record(z.any()).optional(),
    });

    return this.validate(schema);
  }

  static validateFileUpload(allowedTypes = [], maxSize = 10 * 1024 * 1024) {
    return (req, res, next) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;

      if (allowedTypes.length && !allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: "Invalid file type",
          allowedTypes,
        });
      }

      if (file.size > maxSize) {
        return res.status(400).json({
          error: "File too large",
          maxSize: `${maxSize / (1024 * 1024)}MB`,
        });
      }

      if (file.originalname.includes("..") || /[\\/]/.test(file.originalname)) {
        return res.status(400).json({ error: "Invalid file name" });
      }

      next();
    };
  }

  static validateRefreshToken(req, res, next) {
    const refreshTokenSchema = z.object({
      refreshToken: z.string().min(1, "Refresh token is required!"),
    });

    try {
      const parsed = refreshTokenSchema.parse(req.body);
      req.body.refreshToken = parsed.refreshToken;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((detail) => ({
          // Fixed this line
          field: detail.path.join("."),
          message: detail.message,
        }));

        logger.warn("Refresh token validation failed: ", {
          errors: errorMessages,
          ip: req.ip,
          user: req.user?.id,
        });

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          details: errorMessages,
        });
      }

      logger.error("Unexpected refresh token validation error: ", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
  static validateCustom(asyncValidationFn) {
    return async (req, res, next) => {
      try {
        const result = await asyncValidationFn(req);
        if (result?.error) {
          logger.warn("Custom validation failed:", {
            error: result.error,
            ip: req.ip,
            user: req.user?.id,
          });
          return res.status(400).json({ error: result.error });
        }
        next();
      } catch (error) {
        logger.error("Custom validation error: ", error);
        return res.status(500).json({ error: "Validation failed" });
      }
    };
  }
}

module.exports = ValidatorMiddleware;
