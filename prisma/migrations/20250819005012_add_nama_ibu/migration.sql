/*
  Warnings:

  - Added the required column `nama` to the `IbuRumah` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "IbuRumah" ADD COLUMN     "nama" TEXT NOT NULL;
