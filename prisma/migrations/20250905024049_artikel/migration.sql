-- CreateTable
CREATE TABLE "Artikel" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "konten" TEXT NOT NULL,

    CONSTRAINT "Artikel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ArtikelTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArtikelTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_nama_key" ON "Tag"("nama");

-- CreateIndex
CREATE INDEX "_ArtikelTags_B_index" ON "_ArtikelTags"("B");

-- AddForeignKey
ALTER TABLE "_ArtikelTags" ADD CONSTRAINT "_ArtikelTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Artikel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArtikelTags" ADD CONSTRAINT "_ArtikelTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
