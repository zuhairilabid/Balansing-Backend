const OpenAI = require("openai");
const prisma = require('../db');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function untuk mendapatkan rentang tanggal 3 bulan terakhir (bulan saat ini dan 2 bulan sebelumnya)
const getThreeMonthsRange = (currentDate) => {
  const end = new Date(currentDate);
  end.setHours(23, 59, 59, 999); // Akhir bulan saat ini

  // Mulai dari 3 bulan yang lalu, hari pertama
  const start = new Date(currentDate);
  start.setMonth(start.getMonth() - 2);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  // Bulan saat ini (Current Month)
  const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const currentMonthEnd = new Date(currentDate);
  currentMonthEnd.setHours(23, 59, 59, 999);
  
  // Dua bulan sebelumnya (Previous Two Months)
  const previousMonthsStart = new Date(currentDate);
  previousMonthsStart.setMonth(previousMonthsStart.getMonth() - 2);
  previousMonthsStart.setDate(1);
  previousMonthsStart.setHours(0, 0, 0, 0);

  const previousMonthsEnd = new Date(currentDate);
  previousMonthsEnd.setMonth(previousMonthsEnd.getMonth());
  previousMonthsEnd.setDate(0); // Hari terakhir bulan sebelumnya
  previousMonthsEnd.setHours(23, 59, 59, 999);
  
  return { 
    start: start, 
    end: end,
    currentMonthRange: { start: currentMonthStart, end: currentMonthEnd },
    previousMonthsRange: { start: previousMonthsStart, end: previousMonthsEnd }
  };
};

// (getAnalisisKader endpoint removed since frontend doesn't use it directly and we moved to Posyandu)


// =========================================================================
// CONTROLLER LAMA (DIJAGA AGAR TETAP LENGKAP)
// =========================================================================

const getAnalisisGizi = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    // Ambil recap anak berdasarkan ID
    const currentRecap = await prisma.recapAnak.findUnique({
      where: { kodeRecap: id },
      select: {
        anakIbuId: true,
        tanggal: true,
        beratBadan: true,
        tinggiBadan: true,
        usia: true,
        anemia: true,
        stunting: true,
        konjungtivitasNormal: true,
        kukuBersih: true,
        riwayatAnemia: true,
        tampakLemas: true,
        tampakPucat: true,
        rekomendasi: true,
        anakIbu: {
          select: {
            nama: true,
            jenisKelamin: true,
            id: true,
            ibu: {
              select: { nama: true },
            },
          },
        },
      },
    });

    if (!currentRecap) {
      return res.status(404).json({ message: "No recap found with this ID." });
    }

    // Cari recap sebelumnya
    const previousRecap = await prisma.recapAnak.findFirst({
      where: {
        anakIbuId: currentRecap.anakIbuId,
        tanggal: { lt: currentRecap.tanggal },
      },
      orderBy: { tanggal: "desc" },
    });

    // Buat prompt GPT
    const prompt = `
Anda adalah seorang dokter gizi anak yang membuat analisis personal berdasarkan data balita terkini sebagai acuan utama.

Tugas Anda:
1. Gunakan **umur anak (bulan), berat badan, tinggi badan** untuk mengevaluasi kurva pertumbuhan WHO.
    - Jika normal/baik → pujian + rekomendasi mempertahankan.
    - Jika normal tapi mendekati stunting → waspada ringan.
    - Jika kurang → saran nutrisi spesifik.
    - Jika berlebih → kontrol asupan & aktivitas.
2. Evaluasi **status anemia**:
    - Jika normal → apresiasi.
    - Jika anemia → rekomendasi makanan kaya zat besi (daging merah, hati ayam, bayam) & vitamin C.
3. Perhatikan juga faktor kebersihan (kuku, konjungtiva, pucat, lemas).
4. Hubungkan langsung kondisi anak dengan rekomendasi.
5. Gunakan format **Markdown** rapi:
    - ## Informasi Umum
    - ## Analisis Pertumbuhan
    - ## Analisis Anemia
    - ## Analisis Kebersihan & Kondisi Fisik
    - ## Rekomendasi Spesifik
    - ## Kesimpulan

Data terkini:
${JSON.stringify(currentRecap, null, 2)}

Data sebelumnya:
${JSON.stringify(previousRecap, null, 2)}
`;

    // Panggil GPT
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Anda adalah dokter ahli gizi anak." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const rekomendasi = completion.choices[0].message.content;

    // Update recap dengan rekomendasi GPT
    const updatedRecap = await prisma.recapAnak.update({
      where: { kodeRecap: id },
      data: { rekomendasi },
    });

   res.status(201).json({
      message: "Anak uploaded successfully and RecapRt created/updated",
      updatedRecap,
      rekomendasi,
    });
  } catch (error) {
    console.error("Error GPT:", error);
    res.status(500).json({ error: "Gagal menghasilkan rekomendasi." });
  }
};

const getAnalisisSanitasi = async (req, res) => {
  try {
    const { quizResult, email } = req.body;
    
    const prompt = `
Anda adalah seorang dokter anak dengan fokus pada kebersihan & sanitasi.

Berdasarkan hasil quiz berikut, analisis apakah kebiasaan anak sudah bersih atau masih perlu diperbaiki:
${JSON.stringify(quizResult, null, 2)}

PENTING — instruksi yang HARUS dipenuhi:
1.**JANGAN** menampilkan ulang pertanyaan atau jawaban quiz. Langsung masuk ke **analisis mendalam**.
2. Tulis output **HANYA** dalam format **Markdown** (siap dirender di Flutter). Jangan bungkus dalam code fences 
3. Berikan evaluasi kesimpulan dulu apakah hasil sanitasi baik, waspada, atau buruk. Tiap ya atau true itu 1 poin. Jika poin 5 keatas indikasi Baik, 4 Waspada, dan kurang dari itu buruk
4. Bahas lanjut  hasil menjadi empat section jelas dengan heading:
    ## Kesehatan Mulut
    ## Kebersihan Tangan
    ## Higiene Toilet
    ## Penggunaan Air Minum
5. Untuk **masing-masing section** berikan:
    - Satu kalimat penilaian singkat (apresiasi jika baik; peringatan jika kurang).
    - Analisis singkat penyebab/risiko (1-2 paragraf maksimum).
    - Rekomendasi praktis & spesifik (bullet list) yang bisa dilakukan di rumah (usia-balita aware jika ada usia di 'child').
    - Tips monitoring & kapan sebaiknya konsultasi ke tenaga kesehatan.
6. Jika data untuk suatu section **tidak tersedia**, tulis analisis singkat umum + rekomendasi dasar untuk pemeriksaan data tersebut.
7. Gunakan Bahasa Indonesia yang jelas dan ringkas. Fokus pada tindakan praktis.

Hasil markdown harus mudah dibaca & bisa langsung dipakai di Flutter.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Anda adalah dokter anak ahli sanitasi." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const hasil = completion.choices[0].message.content;

    await prisma.ibuRumah.update({
      where: { email: email },
      data: { 
        sanitasi: false,
      },
    });

    res.status(201).json({
      message: "Anak uploaded successfully and RecapRt created/updated",
      rekomendasi: hasil,
    });;
  } catch (error) {
    console.error("Error GPT:", error);
    res.status(500).json({ error: "Gagal menghasilkan analisis sanitasi." });
  }
};

const getAnalisisMakanan = async (req, res) => {
  try {
    const { DDS } = req.body;

    const prompt = `
Anda adalah seorang dokter ahli gizi anak dengan fokus pada keberagaman makanan.

Berdasarkan hasil quiz berikut, analisis apakah keberagaman anak sudah cukup atau belum:
${JSON.stringify(DDS, null, 2)}

PENTING — instruksi yang HARUS dipenuhi:
1. Dari Total 7 Score Keberagaman bandingka berapa total yang ada dan tidak ada. Jika lebih dari 6 maka beragam, 4-5 Cukup Beragam, 3 kebawah kurang
    -Sumber Karbohidrat
    -Kacang legume
    -Produk susu
    -Produk daging
    -Telur
    -Buah dan sayur lainnya
    -Buah dan sayur vitamin A
      
2. Section Pertama bahas kesimpulan dulu apakah sudah beragam, cukup, atau kurang  
3. Section selanjutnya bahas apa saja yang kurang dan apa saja yang sudah terpenuhi
4. Terakhir Bahas dampak pada anak dan rekomendasi berupa aksi
5. Gunakan Bahasa Indonesia yang jelas dan ringkas. Fokus pada tindakan praktis.

Hasil markdown harus mudah dibaca & bisa langsung dipakai di Flutter.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Anda adalah dokter anak ahli gizi anak." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const hasil = completion.choices[0].message.content;
    res.status(201).json({
      message: "Analisis makanan berhasil dibuat.",
      rekomendasi: hasil,
    });
  } catch (error) {
    console.error("Error GPT:", error);
    res.status(500).json({ error: "Gagal menghasilkan analisis makanan." });
  }
};


// Controller untuk batch analisis semua posyandu
const runBatchAnalisisPosyandu = async (req, res) => {
  try {
    console.log("=== Memulai Batch Analisis untuk Semua Posyandu ===");
    
    // 1. Ambil semua posyandu yang ada
    const allPosyandus = await prisma.posyandu.findMany({
      select: {
        id: true,
        namaPosyandu: true,
      },
    });

    if (!allPosyandus || allPosyandus.length === 0) {
      return res.status(404).json({ 
        error: "Tidak ada posyandu yang ditemukan.",
        processedCount: 0 
      });
    }

    console.log(`Ditemukan ${allPosyandus.length} posyandu untuk dianalisis`);

    const results = {
      total: allPosyandus.length,
      success: [],
      failed: [],
      skipped: [],
    };

    // 2. Loop untuk setiap posyandu
    for (const posyandu of allPosyandus) {
      try {
        console.log(`\nMemproses Posyandu: ${posyandu.namaPosyandu} (${posyandu.id})`);

        // Jalankan analisis untuk posyandu ini
        const analisisResult = await generateAnalisisForPosyandu(posyandu.id, posyandu.namaPosyandu);

        if (analisisResult.success) {
          results.success.push({
            id: posyandu.id,
            namaPosyandu: posyandu.namaPosyandu,
            message: analisisResult.message,
          });
          console.log(`✓ Berhasil: ${posyandu.namaPosyandu}`);
        } else {
          results.skipped.push({
            id: posyandu.id,
            namaPosyandu: posyandu.namaPosyandu,
            reason: analisisResult.message,
          });
          console.log(`⊘ Dilewati: ${posyandu.namaPosyandu} - ${analisisResult.message}`);
        }
      } catch (error) {
        console.error(`✗ Error pada Posyandu ${posyandu.namaPosyandu}:`, error.message);
        results.failed.push({
          id: posyandu.id,
          namaPosyandu: posyandu.namaPosyandu,
          error: error.message,
        });
      }
    }

    console.log("\n=== Batch Analisis Selesai ===");
    res.status(200).json({
      message: "Batch analisis posyandu selesai dijalankan.",
      summary: {
        totalPosyandu: results.total,
        berhasil: results.success.length,
        dilewati: results.skipped.length,
        gagal: results.failed.length,
      },
      details: results,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error Batch Analisis Posyandu:", error);
    res.status(500).json({ 
      error: "Gagal menjalankan batch analisis posyandu.",
      detail: error.message 
    });
  }
};

// Fungsi helper untuk generate analisis per posyandu
const generateAnalisisForPosyandu = async (idPosyandu, namaPosyandu) => {
  try {
    // 1. Tentukan rentang waktu
    const today = new Date();
    const { start, end, currentMonthRange, previousMonthsRange } = getThreeMonthsRange(today);
    
    // 2. Ambil data AnakKader yang terkait dengan Posyandu ini
    const kadersInPosyandu = await prisma.kader.findMany({
      where: { posyanduId: idPosyandu },
      select: { id: true }
    });
    const kaderIds = kadersInPosyandu.map(k => k.id);

    const anakKaderRecaps = await prisma.anakKader.findMany({
      where: {
        // Fallback untuk kompabilitas: gunakan id jika ada, atau biarkan kosong jika masih perlu email (tapi sebaiknya id)
        kaderId: { in: kaderIds },
        tanggal: { gte: start, lte: end },
      },
      select: { tanggal: true, stunting: true, anemia: true },
    });

    // 3. Ambil data RecapAnak dari IbuRumah di Posyandu ini
    const ibuInPosyandu = await prisma.ibuRumah.findMany({
      where: { posyanduId: idPosyandu },
      select: { id: true }
    });
    const ibuIds = ibuInPosyandu.map(i => i.id);

    const recapAnakData = await prisma.recapAnak.findMany({
      where: {
        anakIbu: { ibuId: { in: ibuIds } },
        tanggal: { gte: start, lte: end },
      },
      select: { tanggal: true, stunting: true, anemia: true },
    });

    const allRecaps = [...anakKaderRecaps, ...recapAnakData];

    // Jika tidak ada data, skip posyandu ini
    if (allRecaps.length === 0) {
      return { success: false, message: "Tidak ada data recap dalam 3 bulan terakhir" };
    }

    // Hitung jumlah kasus Stunting dan Anemia
    let currentMonthStunting = 0;
    let currentMonthAnemia = 0;
    let previousMonthsStunting = 0;
    let previousMonthsAnemia = 0;
    
    allRecaps.forEach(recap => {
      if (recap.tanggal >= currentMonthRange.start && recap.tanggal <= currentMonthRange.end) {
        if (recap.stunting === 'SangatPendek' || recap.stunting === 'Pendek') currentMonthStunting++;
        if (recap.anemia) currentMonthAnemia++;
      } else if (recap.tanggal >= previousMonthsRange.start && recap.tanggal <= previousMonthsRange.end) {
        if (recap.stunting === 'SangatPendek' || recap.stunting === 'Pendek') previousMonthsStunting++;
        if (recap.anemia) previousMonthsAnemia++;
      }
    });

    const analisisData = {
      rentangWaktu: `${previousMonthsRange.start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} - ${currentMonthRange.end.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
      dataBulanIni: {
        periode: `${currentMonthRange.start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
        stunting: currentMonthStunting,
        anemia: currentMonthAnemia,
      },
      dataDuaBulanSebelumnya: {
        periode: `${previousMonthsRange.start.toLocaleDateString('id-ID', { month: 'long' })} - ${new Date(currentMonthRange.start - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
        stunting: previousMonthsStunting,
        anemia: previousMonthsAnemia,
      },
    };

    const prompt = `
Anda adalah seorang koordinator kesehatan masyarakat yang bertugas menganalisis data balita di Posyandu ${namaPosyandu}.

Tugas Anda:
1. **Rangkum** data kasus stunting (kategori Pendek dan Sangat Pendek) dan anemia pada bulan terkini.
2. **Bandingkan** kasus bulan terkini dengan total kasus 2 bulan sebelumnya (bandingkan jumlah stunting dan anemia secara terpisah).
3. Tentukan apakah terjadi **penurunan** atau **kenaikan** kasus untuk Stunting dan Anemia.
4. Berikan **Analisis Mendalam** mengenai tren yang terjadi (penurunan/kenaikan).
5. Berikan **Rekomendasi Strategis** yang spesifik dan praktis untuk Posyandu di wilayah ini, fokus pada:
   - Tindakan pencegahan Stunting dan Anemia.
   - Peningkatan edukasi kepada orang tua.
   - Optimalisasi monitoring dan kunjungan rumah.
6. Gunakan format **Markdown** yang rapi:
    - ## Ringkasan Data Kesehatan
    - ## Perbandingan Kasus 3 Bulan Terakhir
    - ## Analisis Tren
    - ## Rekomendasi Strategis untuk Posyandu

Data Analisis Kasus (dihitung berdasarkan kejadian recap dalam rentang waktu):
${JSON.stringify(analisisData, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Anda adalah koordinator kesehatan masyarakat ahli data dan strategi." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const analisisPosyandu = completion.choices[0].message.content;

    // Simpan hasil GPT ke kolom 'tinjauan' di tabel Posyandu
    await prisma.posyandu.update({
      where: { id: idPosyandu },
      data: { 
        tinjauan: analisisPosyandu,
        rekomendasi: new Date()
      },
    });

    return { success: true, message: "Analisis berhasil dibuat dan disimpan" };
  } catch (error) {
    throw error;
  }
};

// Fungsi untuk cron job
const runScheduledBatchAnalisis = async () => {
  try {
    console.log("=== [CRON] Memulai Batch Analisis Terjadwal ===");
    
    const allPosyandus = await prisma.posyandu.findMany({
      select: { id: true, namaPosyandu: true },
    });

    if (!allPosyandus || allPosyandus.length === 0) {
      console.log("Tidak ada posyandu yang ditemukan.");
      return { success: false, message: "Tidak ada posyandu" };
    }

    const results = {
      total: allPosyandus.length,
      success: [],
      failed: [],
      skipped: [],
    };

    for (const posyandu of allPosyandus) {
      try {
        const analisisResult = await generateAnalisisForPosyandu(posyandu.id, posyandu.namaPosyandu);

        if (analisisResult.success) {
          results.success.push({ id: posyandu.id, namaPosyandu: posyandu.namaPosyandu });
        } else {
          results.skipped.push({ id: posyandu.id, namaPosyandu: posyandu.namaPosyandu, reason: analisisResult.message });
        }
      } catch (error) {
        results.failed.push({ id: posyandu.id, namaPosyandu: posyandu.namaPosyandu, error: error.message });
      }
    }

    console.log(`[CRON] Selesai - Berhasil: ${results.success.length}, Dilewati: ${results.skipped.length}, Gagal: ${results.failed.length}`);

    return { success: true, summary: results, timestamp: new Date() };
  } catch (error) {
    console.error("[CRON] Error Batch Analisis:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { 
    getAnalisisSanitasi, 
    getAnalisisGizi, 
    getAnalisisMakanan, 
    runBatchAnalisisPosyandu,
    runScheduledBatchAnalisis,  
};