/*
  Warnings:

  - Changed the type of `usia` on the `AnakIbu` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AnakIbu" DROP COLUMN "usia",
ADD COLUMN     "usia" TIMESTAMP(3) NOT NULL;
