/*
  Warnings:

  - The `verificationLevel` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
ALTER TYPE "VerificationLevel" ADD VALUE 'address_verified';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "verificationLevel",
ADD COLUMN     "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'unverified';
