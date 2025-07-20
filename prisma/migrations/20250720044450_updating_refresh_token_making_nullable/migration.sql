/*
  Warnings:

  - A unique constraint covering the columns `[refresh_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "refresh_token" DROP NOT NULL,
ALTER COLUMN "refresh_token" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "users_refresh_token_key" ON "users"("refresh_token");
