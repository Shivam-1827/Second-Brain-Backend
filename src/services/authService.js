const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const databaseManager = require("../utils/database");
const logger = require("../utils/logger");
const AuthMiddleware = require("../middleware/auth");
const ErrorHandlerMiddleware = require("../middleware/errorHandler");
const { access } = require("fs");

class AuthService {
  constructor() {
    this.db = databaseManager.getInstance();
  }

  // Register new user
  async register(userData) {
    try {
      const { email, password, firstName, lastName } = userData;

      // Check if user already exists
      const existingUser = await this.db.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new ErrorHandlerMiddleware.ConflictError(
          "User with this email already exists"
        );
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await this.db.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName, // Corrected: firstName (was first_name)
          lastName, // Corrected: lastName (was last_name)
        },
        select: {
          id: true,
          email: true,
          firstName: true, // Corrected: firstName (was first_name)
          lastName: true, // Corrected: lastName (was last_name)
          createdAt: true, // Corrected: createdAt (was created_at)
        },
      });

      // Generate tokens
      const accessToken = AuthMiddleware.generateToken({ userId: user.id });
      const refreshToken = AuthMiddleware.generateRefreshToken({
        userId: user.id,
      });

      // Store refresh token - this method will use the correct camelCase field
      await this.storeRefreshToken(user.id, refreshToken);

      logger.info("User registered successfully:", {
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName, // Corrected: user.firstName (was user.first_name)
          lastName: user.lastName, // Corrected: user.lastName (was user.last_name)
          createdAt: user.createdAt, // Corrected: user.createdAt (was user.created_at)
        },
        tokens: {
          access: accessToken,
          refresh: refreshToken,
        },
      };
    } catch (error) {
      logger.error("Registration failed:", error);
      throw error;
    }
  }

  async login(credentials) {
    try {
      const { email, password } = credentials;

      // Find user
      const user = await this.db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
          firstName: true, // Corrected: firstName (was first_name)
          lastName: true, // Corrected: lastName (was last_name)
          createdAt: true, // Corrected: createdAt (was created_at)
          lastLogin: true, // Corrected: lastLogin (was last_login)
        },
      });

      if (!user) {
        throw new ErrorHandlerMiddleware.UnauthorizedError(
          "Invalid credentials"
        );
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new ErrorHandlerMiddleware.UnauthorizedError(
          "Invalid credentials"
        );
      }

      // Generate tokens
      const accessToken = AuthMiddleware.generateToken({ userId: user.id });
      const refreshToken = AuthMiddleware.generateRefreshToken({
        userId: user.id,
      });

      // Store refresh token
      await this.storeRefreshToken(user.id, refreshToken);

      // Update last login
      await this.db.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }, // Corrected: lastLogin (was last_login)
      });

      logger.info("User logged in successfully:", {
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName, // Corrected: user.firstName (was user.first_name)
          lastName: user.lastName, // Corrected: user.lastName (was user.last_name)
          createdAt: user.createdAt, // Corrected: user.createdAt (was user.created_at)
        },
        tokens: {
          access: accessToken,
          refresh: refreshToken,
        },
      };
    } catch (error) {
      logger.error("Login failed:", error);
      throw error;
    }
  }

  // refrsh access token
  async refreshToken(oldRefreshToken){
    try {
      const decode = AuthMiddleware.verifyRefreshToken(oldRefreshToken);

      console.log(`Decode refresh token payload: `, decode);

      const user = await this.db.user.findUnique({
        where: {id: decode.userId},
        select: {
          id: true,
          refreshToken: true,
        },
      });

      if(!user || user.refreshToken !== oldRefreshToken){
        throw new ErrorHandlerMiddleware.UnauthorizedError("Invalid or expured refresh token!");
      }

      const newAccessToken = AuthMiddleware.generateToken({userId: user.id});
      const newRefreshToken = AuthMiddleware.generateRefreshToken({userId: user.id});

      await this.db.user.update({
        where: {id: user.id},
        data: {refreshToken: newRefreshToken}
      });

      logger.info(`Token refreshed for user: ${user.id}`);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      logger.error(`Failed to refresh token: `, error);
      throw error;
    }
  }

  // Store refresh token
  async storeRefreshToken(userId, refreshToken) {
    try {
      // For simplicity, storing in user table
      // In production, consider a separate refresh_tokens table
      await this.db.user.update({
        where: {
          id: userId,
        },
        data: {
          refreshToken: refreshToken, // Corrected: refreshToken (was refresh_token)
        },
      });
    } catch (error) {
      logger.error("Failed to store refresh token:", error);
      throw error;
    }
  }

  // Remove refresh token
  async removeRefreshToken(userId) {
    try {
      await this.db.user.update({
        where: { id: userId },
        data: { refreshToken: null }, // Corrected: refreshToken (was refresh_token)
      });
    } catch (error) {
      logger.error("Failed to remove refresh token:", error);
      throw error;
    }
  }

  // logout user
  async logout(userId){
    try {
      await this.removeRefreshToken(userId);
      logger.info("user logged out successfully : ");
      return {message: "logged out successfully"};
    } catch (error) {
      logger.error("Logout failed: ", error);
      throw error;
    }
  }

  // Remove all refresh tokens for a user
  async removeAllRefreshTokens(userId) {
    try {
      await this.db.user.update({
        where: { id: userId },
        data: { refreshToken: null }, // Corrected: refreshToken (was refresh_token)
      });
    } catch (error) {
      logger.error("Failed to remove all refresh tokens:", error);
      throw error;
    }
  }

  // Get user profile
  async getUserProfile(userId) {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true, // Corrected: firstName (was first_name)
          lastName: true, // Corrected: lastName (was last_name)
          createdAt: true, // Corrected: createdAt (was created_at)
          lastLogin: true, // Corrected: lastLogin (was last_login)
        },
      });

      if (!user) {
        throw new ErrorHandlerMiddleware.NotFoundError("User not found");
      }

      return user;
    } catch (error) {
      logger.error("Failed to get user profile:", error);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updateData) {
    try {
      const { firstName, lastName } = updateData; // Corrected: firstName, lastName (was first_name, last_name)

      const user = await this.db.user.update({
        where: { id: userId },
        data: {
          firstName, // Corrected: firstName (was first_name)
          lastName, // Corrected: lastName (was last_name)
        },
        select: {
          id: true,
          email: true,
          firstName: true, // Corrected: firstName (was first_name)
          lastName: true, // Corrected: lastName (was last_name)
          createdAt: true, // Corrected: createdAt (was created_at)
        },
      });

      logger.info("User profile updated:", { userId });

      return user;
    } catch (error) {
      logger.error("Failed to update user profile:", error);
      throw error;
    }
  }

  // Change user password
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await this.db.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!user) {
        throw new ErrorHandlerMiddleware.NotFoundError("User not found");
      }

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isValidPassword) {
        throw new ErrorHandlerMiddleware.UnauthorizedError(
          "Invalid current password"
        );
      }

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await this.db.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      logger.info("Password changed for user:", { userId });
    } catch (error) {
      logger.error("Failed to change password:", error);
      throw error;
    }
  }

  // Forgot password - Generate reset token and send email
  async forgotPassword(email) {
    try {
      const user = await this.db.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (!user) {
        // For security, don't reveal if user doesn't exist
        logger.warn("Forgot password request for non-existent email:", email);
        return; // Or throw a generic error to prevent enumeration
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      await this.db.user.update({
        where: { id: user.id },
        data: {
          resetToken, // Corrected: resetToken (was reset_token)
          resetTokenExpiry, // Corrected: resetTokenExpiry (was reset_token_expiry)
        },
      });

      // In a real application, you would send an email here
      logger.info(`Password reset token generated for ${email}: ${resetToken}`);
      // Example: sendPasswordResetEmail(email, resetToken);
    } catch (error) {
      logger.error("Forgot password failed:", error);
      throw error;
    }
  }

  // Reset password
  async resetPassword(token, newPassword) {
    try {
      const user = await this.db.user.findFirst({
        where: {
          resetToken: token, // Corrected: resetToken (was reset_token)
          resetTokenExpiry: {
            // Corrected: resetTokenExpiry (was reset_token_expiry)
            gte: new Date(),
          },
        },
        select: { id: true },
      });

      if (!user) {
        throw new ErrorHandlerMiddleware.UnauthorizedError(
          "Invalid or expired reset token"
        );
      }

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await this.db.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null, // Corrected: resetToken (was reset_token)
          resetTokenExpiry: null, // Corrected: resetTokenExpiry (was reset_token_expiry)
        },
      });

      logger.info("Password reset successfully for user:", { userId: user.id });
    } catch (error) {
      logger.error("Reset password failed:", error);
      throw error;
    }
  }
}

module.exports = new AuthService();
