/*
  Warnings:

  - The `rekomendasi` column on the `Kader` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Kader" DROP COLUMN "rekomendasi",
ADD COLUMN     "rekomendasi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
