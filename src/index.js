require("dotenv").config();

const express = require("express");
const cors = require("cors");

// Import utilities
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");

// Import routes
const authRoutes = require("./routes/auth");
const assetRoutes = require('./routes/assets');

// Import database
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:4000",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/assets", assetRoutes);

// Graceful shutdown

process.on("SIGTERN", async () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // server.close(() => {
  //   logger.info("HTTP server closed");
  // });

  await prisma.$disconnect();
  logger.info("Database connection closed");

  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");

  // server.close(() => {
  //   logger.info("HTTP server closed");
  // });

  await prisma.$disconnect();
  logger.info("Database connection closed");

  process.exit(0);
});

// Unhandled promise rejection handler
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Uncaught exception handler
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

const SERVER_PORT = process.env.SERVER_PORT || 4000;

app.listen(SERVER_PORT, () => {
  logger.info("Server has started!");
  console.log(`Server is running at port ${SERVER_PORT}`);
});
