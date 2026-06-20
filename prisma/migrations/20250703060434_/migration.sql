/*
  Warnings:

  - You are about to drop the column `nama` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Kader" ALTER COLUMN "kodePos" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "nama";
