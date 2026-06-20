/*
  Warnings:

  - Added the required column `jenisKelamin` to the `AnakIbu` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jenisKelamin` to the `AnakKader` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AnakIbu" ADD COLUMN     "jenisKelamin" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AnakKader" ADD COLUMN     "jenisKelamin" TEXT NOT NULL;
