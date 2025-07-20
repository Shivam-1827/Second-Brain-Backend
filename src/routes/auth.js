const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");
const validator = require("../middleware/validator");
const rateLimiter = require("../middleware/rateLimiter");

// console.log(authMiddleware.verifyToken);

const router = express.Router();

router.post("/register", authController.register);

router.post("/login", authController.login);

router.post('/logout', authMiddleware.verifyToken, authController.logout);

router.post('/refresh-token', authController.refreshToken);

router.post('/forgot-password', authController.forgotPassword);    // i will see it later on

router.post('/reset-password', authController.resetPassword);  //i will see it later on

router.get('/profile', authMiddleware.verifyToken, authController.getProfile);

router.put('/profile', authMiddleware.verifyToken, authController.updateProfile);

router.post('/change-password', authMiddleware.verifyToken, authController.changePassword);

module.exports = router;
