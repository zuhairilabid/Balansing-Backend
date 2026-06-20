/*
  Warnings:

  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `IbuRumah` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `Kader` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `IbuRumah` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `Kader` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kaderEmail` to the `RecapRt` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "IbuRumah" ADD COLUMN     "email" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Kader" ADD COLUMN     "email" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RecapRt" ADD COLUMN     "kaderEmail" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("email");

-- CreateIndex
CREATE UNIQUE INDEX "IbuRumah_email_key" ON "IbuRumah"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Kader_email_key" ON "Kader"("email");

-- AddForeignKey
ALTER TABLE "Kader" ADD CONSTRAINT "Kader_email_fkey" FOREIGN KEY ("email") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IbuRumah" ADD CONSTRAINT "IbuRumah_email_fkey" FOREIGN KEY ("email") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRt" ADD CONSTRAINT "RecapRt_kaderEmail_fkey" FOREIGN KEY ("kaderEmail") REFERENCES "Kader"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
