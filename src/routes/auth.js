const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");
const validator = require("../middleware/validator");
const rateLimiter = require("../middleware/rateLimiter");

// console.log(validator.validUserRegistration);

const router = express.Router();

router.post(
  "/register",
  validator.validUserRegistration(),
  authController.register
);

router.post("/login", validator.validateUserLogin(), authController.login);

router.post("/logout", authMiddleware.verifyToken, authController.logout);

router.post(
  "/refresh-token",
  (req, res, next) => validator.validateRefreshToken(req, res, next),
  authController.refreshToken
);

router.post(
  "/forgot-password",
  validator.validateForgotPassword(),
  authController.forgotPassword
); // i will see it later on

router.post(
  "/reset-password",
  validator.validateResetPassword(),
  authController.resetPassword
); //i will see it later on

router.get("/profile", authMiddleware.verifyToken, authController.getProfile);

router.put(
  "/profile",
  authMiddleware.verifyToken,
  authController.updateProfile
);

router.post(
  "/change-password",
  authMiddleware.verifyToken,
  validator.validateChangePassword(),
  authController.changePassword
);

router.post(
  "/request-otp",
   validator.validateOTPRequest(), 
   authController.otpRequest
);

router.post("/verify-otp", 
  validator.validateOTPVerify(),
  authController.otpVerify
);

module.exports = router;
