// controllers/authController.js
const authService = require("../services/authService");
const logger = require("../utils/logger");

class AuthController {
  async register(req, res) {
    try {
      const { email, password, firstName, lastName } = req.body;

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
      });

      logger.info(`User registered successfully: ${email}`);
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      logger.error("Registration failed:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      const result = await authService.login({email, password});

      logger.info(`User logged in successfully: ${email}`);
      res.json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      logger.error("Login failed:", error);
      res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }

  async logout(req, res) {
    try {
      const userId = req.user.id;

      await authService.logout(userId);

      logger.info("User logged out successfully");
      res.json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      logger.error("Logout failed:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      logger.error("Token refresh failed:", error);
      res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }

  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const user = await authService.getUserProfile(userId);

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error("Get profile failed:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.body;

      const user = await authService.updateUserProfile(userId, updates);

      logger.info(`Profile updated for user: ${userId}`);
      res.json({
        success: true,
        message: "Profile updated successfully",
        data: user,
      });
    } catch (error) {
      logger.error("Update profile failed:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      await authService.changePassword(userId, currentPassword, newPassword);

      logger.info(`Password changed for user: ${userId}`);
      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      logger.error("Change password failed:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      await authService.forgotPassword(email);

      res.json({
        success: true,
        message: "Password reset email sent",
      });
    } catch (error) {
      logger.error("Forgot password failed:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      await authService.resetPassword(token, newPassword);

      res.json({
        success: true,
        message: "Password reset successful",
      });
    } catch (error) {
      logger.error("Reset password failed:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async otpRequest(req, res)  {
    try {
      const {contactMethod, contact} = req.body;

      await authService.otpRequest(contactMethod, contact);

      res.json({
        success: true,
        message: "OTP request published successfully"
      });
    } catch (error) {
      logger.error("OTP generation failed", error);
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  

  async otpVerify(req, res) {
    try {
      const {contactMethod, contact, otp} = req.body;

      await authService.otpVerify(contactMethod, contact, otp);

      res.status(200).json({
        success: true,
        message: "OTP verified successfully!"
      });

      logger.info("OTP verified successfully");
      
    } catch (error) {
      logger.error("OTP  generator failed", error);
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new AuthController();
