-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nama" TEXT,
    "jenis" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kader" (
    "id" TEXT NOT NULL,
    "namaPuskesmas" TEXT NOT NULL,
    "namaPosyandu" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,
    "kota" TEXT NOT NULL,
    "kecamatan" TEXT NOT NULL,
    "kelurahan" TEXT NOT NULL,
    "rt" TEXT NOT NULL,
    "rw" TEXT NOT NULL,
    "kodePos" TEXT NOT NULL,

    CONSTRAINT "Kader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IbuRumah" (
    "id" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,
    "kota" TEXT NOT NULL,
    "kecamatan" TEXT NOT NULL,
    "kelurahan" TEXT NOT NULL,
    "rt" TEXT NOT NULL,
    "rw" TEXT NOT NULL,
    "kodePos" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "usia" INTEGER NOT NULL,
    "noTelp" TEXT NOT NULL,

    CONSTRAINT "IbuRumah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnakIbu" (
    "id" TEXT NOT NULL,
    "ibuId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "usia" INTEGER NOT NULL,
    "beratBadan" DOUBLE PRECISION NOT NULL,
    "tinggiBadan" DOUBLE PRECISION NOT NULL,
    "stunting" BOOLEAN NOT NULL,
    "anemia" BOOLEAN NOT NULL,

    CONSTRAINT "AnakIbu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnakKader" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "namaIbu" TEXT NOT NULL,
    "usia" INTEGER NOT NULL,
    "beratBadan" DOUBLE PRECISION NOT NULL,
    "tinggiBadan" DOUBLE PRECISION NOT NULL,
    "anemia" BOOLEAN NOT NULL,
    "stunting" BOOLEAN NOT NULL,

    CONSTRAINT "AnakKader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapRt" (
    "id" TEXT NOT NULL,
    "anakKaderId" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "rt" TEXT NOT NULL,

    CONSTRAINT "RecapRt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RecapRt_anakKaderId_key" ON "RecapRt"("anakKaderId");

-- AddForeignKey
ALTER TABLE "AnakIbu" ADD CONSTRAINT "AnakIbu_ibuId_fkey" FOREIGN KEY ("ibuId") REFERENCES "IbuRumah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRt" ADD CONSTRAINT "RecapRt_anakKaderId_fkey" FOREIGN KEY ("anakKaderId") REFERENCES "AnakKader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
