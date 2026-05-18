/*
  Warnings:

  - The `verificationLevel` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('unverified', 'email_verified', 'postcard_verified');

-- AlterTable
ALTER TABLE "MicroCommunity" ADD COLUMN     "boundary" geometry;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "verificationLevel",
ADD COLUMN     "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'unverified';
