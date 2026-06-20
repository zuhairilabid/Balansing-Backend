/*
  Warnings:

  - You are about to drop the column `ibuId` on the `AnakIbu` table. All the data in the column will be lost.
  - Added the required column `emailIbu` to the `AnakIbu` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AnakIbu" DROP CONSTRAINT "AnakIbu_ibuId_fkey";

-- AlterTable
ALTER TABLE "AnakIbu" DROP COLUMN "ibuId",
ADD COLUMN     "emailIbu" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "AnakIbu" ADD CONSTRAINT "AnakIbu_emailIbu_fkey" FOREIGN KEY ("emailIbu") REFERENCES "IbuRumah"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
