/*
  Warnings:

  - You are about to drop the column `konjungtivitas` on the `AnakKader` table. All the data in the column will be lost.
  - You are about to drop the column `kuku` on the `AnakKader` table. All the data in the column will be lost.
  - You are about to drop the column `lemas` on the `AnakKader` table. All the data in the column will be lost.
  - You are about to drop the column `pucat` on the `AnakKader` table. All the data in the column will be lost.
  - You are about to drop the column `riwayatAnemua` on the `AnakKader` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnakKader" DROP COLUMN "konjungtivitas",
DROP COLUMN "kuku",
DROP COLUMN "lemas",
DROP COLUMN "pucat",
DROP COLUMN "riwayatAnemua",
ADD COLUMN     "konjungtivitaNormal" BOOLEAN,
ADD COLUMN     "kukuBersih" BOOLEAN,
ADD COLUMN     "riwayatAnemia" BOOLEAN,
ADD COLUMN     "tampakLemas" BOOLEAN,
ADD COLUMN     "tampakPucat" BOOLEAN;
