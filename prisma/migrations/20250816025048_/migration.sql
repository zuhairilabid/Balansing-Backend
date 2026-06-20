/*
  Warnings:

  - Changed the type of `stunting` on the `AnakIbu` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `stunting` on the `AnakKader` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "StuntingType" AS ENUM ('SangatPendek', 'Pendek', 'Normal', 'Tinggi');

-- AlterTable
ALTER TABLE "AnakIbu" DROP COLUMN "stunting",
ADD COLUMN     "stunting" "StuntingType" NOT NULL;

-- AlterTable
ALTER TABLE "AnakKader" DROP COLUMN "stunting",
ADD COLUMN     "stunting" "StuntingType" NOT NULL;
