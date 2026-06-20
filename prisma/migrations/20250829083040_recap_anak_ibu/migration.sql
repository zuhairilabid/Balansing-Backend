-- CreateTable
CREATE TABLE "RecapAnak" (
    "kodeRecap" TEXT NOT NULL,
    "anakIbuId" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "beratBadan" DOUBLE PRECISION NOT NULL,
    "tinggiBadan" DOUBLE PRECISION NOT NULL,
    "usia" INTEGER NOT NULL,
    "anemia" BOOLEAN NOT NULL,
    "stunting" "StuntingType" NOT NULL,
    "konjungtivitasNormal" BOOLEAN NOT NULL,
    "kukuBersih" BOOLEAN NOT NULL,
    "riwayatAnemia" BOOLEAN NOT NULL,
    "tampakLemas" BOOLEAN NOT NULL,
    "tampakPucat" BOOLEAN NOT NULL,
    "rekomendasi" TEXT NOT NULL,

    CONSTRAINT "RecapAnak_pkey" PRIMARY KEY ("kodeRecap")
);

-- AddForeignKey
ALTER TABLE "RecapAnak" ADD CONSTRAINT "RecapAnak_anakIbuId_fkey" FOREIGN KEY ("anakIbuId") REFERENCES "AnakIbu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
