/*
  Warnings:

  - You are about to drop the `RecapRt` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `kaderEmail` to the `AnakKader` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tanggal` to the `AnakKader` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RecapRt" DROP CONSTRAINT "RecapRt_anakKaderId_fkey";

-- DropForeignKey
ALTER TABLE "RecapRt" DROP CONSTRAINT "RecapRt_kaderEmail_fkey";

-- AlterTable
ALTER TABLE "AnakKader" ADD COLUMN     "kaderEmail" TEXT NOT NULL,
ADD COLUMN     "tanggal" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "RecapRt";

-- AddForeignKey
ALTER TABLE "AnakKader" ADD CONSTRAINT "AnakKader_kaderEmail_fkey" FOREIGN KEY ("kaderEmail") REFERENCES "Kader"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
