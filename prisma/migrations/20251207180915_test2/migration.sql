/*
  Warnings:

  - The `cekAnak` column on the `IbuRumah` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "IbuRumah" DROP COLUMN "cekAnak",
ADD COLUMN     "cekAnak" BOOLEAN;
