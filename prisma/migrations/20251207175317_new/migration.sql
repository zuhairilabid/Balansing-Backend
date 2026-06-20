/*
  Warnings:

  - You are about to drop the column `sanitasi` on the `Kader` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "IbuRumah" ADD COLUMN     "sanitasi" BOOLEAN;

-- AlterTable
ALTER TABLE "Kader" DROP COLUMN "sanitasi";
