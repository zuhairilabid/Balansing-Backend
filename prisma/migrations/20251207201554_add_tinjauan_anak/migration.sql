/*
  Warnings:

  - You are about to drop the column `tinjauan` on the `IbuRumah` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnakIbu" ADD COLUMN     "tinjauan" TEXT;

-- AlterTable
ALTER TABLE "IbuRumah" DROP COLUMN "tinjauan";
