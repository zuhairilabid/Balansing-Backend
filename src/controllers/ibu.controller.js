// controllers/user.controller.js

const ClientError = require("../errors/ClientError");
const { createClient } = require('@supabase/supabase-js');
// const bcrypt = require('bcryptjs'); // Tidak perlu lagi jika Supabase yang menghash
const crypto = require('crypto');
const passport = require('../passport'); // Jika Anda menggunakan passport
const jwt = require('jsonwebtoken');
const { get } = require("http");
const { register } = require("module");
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { addDays, isPast, startOfDay } = require('date-fns');
// Supabase Client untuk sisi client (jika Anda menggunakannya di backend untuk beberapa kasus)
// Biasanya ini untuk operasi yang memerlukan kunci ANON_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); // <--- PERBAIKAN: Gunakan ANON_KEY

const DAYS_TO_ADD = 14;

// Supabase Admin Client untuk operasi backend yang membutuhkan hak akses penuh
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // <--- PERBAIKAN: Gunakan SERVICE_ROLE_KEY
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const prisma = require('../db');

// Helper untuk shift zona waktu ke WIB khusus untuk frontend yang membaca string UTC langsung
const toWIB = (date) => {
  if (!date) return date;
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
};

const getIbu = async (req, res) => {
  const { email } = req.params;
  try {
    // 0. Pengecekan Lazy Evaluation Callback
    // Memastikan reset dijalankan jika cron job di background gagal/terlewat
    await resetIbuRumahChecks();

    // --- QUERY 1: Ambil data IbuRumah ---
    // Query ini akan dijalankan dan ditunggu hasilnya
    const ibu = await prisma.ibuRumah.findUnique({
      where: { email },
      include: {
        _count: {
          select: { anakAnak: true }
        },
      },
    });

    // 2. Error Handling (IbuRumah)
    if (!ibu) {
      return res.status(404).json({ message: "Data Ibu Rumah tidak ditemukan." });
    }

    // --- QUERY 2: Ambil data GlobalSchedule ---
    // Query ini akan dijalankan HANYA SETELAH Query 1 selesai
    const schedule = await prisma.globalSchedule.findUnique({
      // Catatan: Menggunakan key: '1' sesuai permintaan, 
      // tapi disarankan menggunakan key deskriptif seperti 'CHECK_RESET_DATE'
      where: { key: '1' },
      select: { value_date: true, last_execution: true },
    });

    // 3. Error Handling (Schedule)
    if (!schedule || !schedule.value_date) {
      ibu.jadwalResetBerikutnya = null;
    } else {
      ibu.jadwalResetBerikutnya = toWIB(schedule.value_date);
    }

    // 4. Ambil Tanggal Pengecekan Terakhir Sebenarnya dari RecapAnak
    const latestRecap = await prisma.recapAnak.findFirst({
      where: { anakIbu: { emailIbu: email } },
      orderBy: { tanggal: 'desc' },
      select: { tanggal: true }
    });

    if (latestRecap) {
      ibu.terakhirDijalankan = toWIB(latestRecap.tanggal);
    } else {
      ibu.terakhirDijalankan = null; // Belum pernah cek
    }

    // 5. Kirim Respon JSON
    return res.status(200).json(ibu);

  } catch (error) {
    console.error("Error fetching data sequentially:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server internal." });
  }
};

const getAnakIbubyId = async (req, res) => {
  try {
    const { id } = req.params; // Assuming id is the unique identifier for AnakKader
    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    const recap = await prisma.anakIbu.findUnique({
      where: { id: id }, // Ensure id is parsed to an integer if it's a number
    });

    if (!recap) {
      return res.status(200).json({ message: "No recap found with this ID." });
    }

    res.status(200).json(recap);
  } catch (error) {
    console.error("Error fetching recap by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const getDashboardAnak = async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil data AnakIbu berdasarkan ID
    const anakIbu = await prisma.anakIbu.findUnique({
      where: { id: id },
    });

    if (!anakIbu) {
      return res.status(404).json({
        success: false,
        message: "Data anak tidak ditemukan."
      });
    }

    // Ambil semua data RecapAnak untuk anak tersebut, diurutkan dari yang terbaru
    const recapAnakData = await prisma.recapAnak.findMany({
      where: { anakIbuId: id },
      orderBy: {
        tanggal: 'desc',
      },
    });

    if (recapAnakData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data rekap untuk anak ini tidak ditemukan."
      });
    }

    // Ambil data terbaru (terbaru)
    const dataTerbaru = recapAnakData[0];
    // Ambil data sebelumnya (terbaru kedua, jika ada)
    const dataSebelumnya = recapAnakData.length > 1 ? recapAnakData[1] : null;

    // Ambil data BB dan TB selama 12 bulan terakhir
    const now = new Date();
    const twelveMonthsAgo = new Date(now.setMonth(now.getMonth() - 12));

    const last12MonthsData = await prisma.recapAnak.findMany({
      where: {
        anakIbuId: id,
        tanggal: {
          gte: twelveMonthsAgo,
        },
      },
      orderBy: {
        tanggal: 'asc',
      },
    });

    // Hitung rata-rata BB dan TB
    const totalBB = last12MonthsData.reduce((sum, record) => sum + record.beratBadan, 0);
    const totalTB = last12MonthsData.reduce((sum, record) => sum + record.tinggiBadan, 0);
    const averageBB = last12MonthsData.length > 0 ? totalBB / last12MonthsData.length : 0;
    const averageTB = last12MonthsData.length > 0 ? totalTB / last12MonthsData.length : 0;

    // Siapkan data untuk 12 bulan terakhir (per bulan)
    const monthlyBB = {};
    const monthlyTB = {};
    for (let i = 0; i < 12; i++) {
      const date = new Date(now);
      date.setMonth(now.getMonth() + i - 12);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      monthlyBB[monthYear] = 0;
      monthlyTB[monthYear] = 0;
    }

    last12MonthsData.forEach(record => {
      const date = new Date(record.tanggal);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      monthlyBB[monthYear] = record.beratBadan;
      monthlyTB[monthYear] = record.tinggiBadan;
    });

    const last12MonthsBB = Object.values(monthlyBB);
    const last12MonthsTB = Object.values(monthlyTB);

    let kondisi, kategori;
    if (anakIbu.beratBadanL < 2500 && anakIbu.tinggiBadanL < 48) {
      kondisi = "Berat & Tinggi Lahir Kurang";
      kategori = "kurang";
    } else if (anakIbu.beratBadanL < 2500) {
      kondisi = "Berat Lahir Kurang";
      kategori = "kurang";
    } else if (anakIbu.tinggiBadanL < 48) {
      kondisi = "Tinggi Lahir Kurang";
      kategori = "kurang";
    } else if (anakIbu.beratBadanL > 4000) {
      kondisi = "Berat Lahir Lebih";
      kategori = "lebih";
    } else {
      kondisi = "Normal";
      kategori = "normal";
    }

    // Format respons
    const responseData = {
      nama: anakIbu.nama,
      rekomendasi: dataTerbaru.rekomendasi,
      jenisKelamin: anakIbu.jenisKelamin,
      tanggalPeriksaTerakhir: toWIB(dataTerbaru.tanggal),
      bb: dataTerbaru.beratBadan,
      tb: dataTerbaru.tinggiBadan,
      bbL: anakIbu.beratBadanL,
      tbL: anakIbu.tinggiBadanL,
      kondisiL: kondisi,
      kategoriL: kategori,
      umur: dataTerbaru.usia,
      statusStunting: dataTerbaru.stunting,
      statusAnemia: dataTerbaru.anemia,
      zScore: anakIbu.zscore,
      // Jika dataSebelumnya null (belum ada history pemeriksaan), fallback ke beratBadanL dan tinggiBadanL dari AnakIbu
      bbSebelumnya: dataSebelumnya ? dataSebelumnya.beratBadan : anakIbu.beratBadanL,
      tbSebelumnya: dataSebelumnya ? dataSebelumnya.tinggiBadan : anakIbu.tinggiBadanL,
      rataRataBB12Bulan: averageBB.toFixed(2),
      rataRataTB12Bulan: averageTB.toFixed(2),
      data12BulanTerakhir: {
        bb: last12MonthsBB,
        tb: last12MonthsTB,
      },
    };

    return res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("Error in getDashboardAnak:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
      error: error.message
    });
  }
};

const getAllRecapAnak = async (req, res) => {
  try {
    const { idAnak } = req.params
    if (!idAnak) {
      return res.status(400).json({ error: "ID is required." });
    }

    const Allrecap = await prisma.anakIbu.findUnique({
      where: { anakIbuId: idAnak }, // Ensure id is parsed to an integer if it's a number
    });

    if (!Allrecap) {
      return res.status(200).json({ message: "No recap found with this ID." });
    }
    res.status(200).json(recap);
  } catch (error) {
    console.error("Error fetching recap by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const deleteAnakbyId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    // 1. Hapus semua data RecapAnak yang memiliki relasi dengan AnakIbu
    //    Ini untuk menghindari error constraint foreign key
    const deletedRecap = await prisma.recapAnak.deleteMany({
      where: { anakIbuId: id },
    });

    // 2. Sekarang, hapus data AnakIbu itu sendiri
    const deletedAnak = await prisma.anakIbu.delete({
      where: { id: id },
    });

    // Cek apakah AnakIbu berhasil dihapus.
    // Jika tidak ditemukan, prisma.delete akan melempar error,
    // jadi tidak perlu cek `if (!deletedAnak)`.

    console.log(`Berhasil menghapus ${deletedRecap.count} data RecapAnak.`);
    console.log("Berhasil menghapus data AnakIbu dengan ID:", id);

    res.status(200).json({ message: "Anak dan semua rekap terkait berhasil dihapus." });
  } catch (error) {
    if (error.code === 'P2025') { // Error code untuk data tidak ditemukan di Prisma
      return res.status(404).json({ message: "Anak tidak ditemukan dengan ID ini." });
    }
    console.error("Error saat menghapus data Anak:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addAnak = async (req, res) => {
  try {
    const { email, nama, beratBadan, tinggiBadan, jenisKelamin, usia, bbLahir, tbLahir } = req.body;

    const today = dayjs();
    // Diasumsikan 'usia' adalah tanggal lahir (birthDate) dalam format yang dapat diparsing oleh dayjs
    const birthDate = dayjs(usia);
    const usiaInMonths = today.diff(birthDate, 'month');

    // --- 1. Panggil API untuk memeriksa stunting ---
    let stuntingStatus;
    try {
      // Mengubah jenis kelamin menjadi 'l' atau 'p' sebelum dikirim ke API
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        console.warn("Invalid 'jenisKelamin' value. Defaulting to 'l'.");
        kelaminUntukAPI = 'l';
      }

      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usiaBulan: usiaInMonths,
          tinggi: parseFloat(tinggiBadan),
          kelamin: kelaminUntukAPI,
        }),
      });

      if (!stuntingResponse.ok) {
        const errorText = await stuntingResponse.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${stuntingResponse.status}`);
      }

      const stuntingResult = await stuntingResponse.json();
      stuntingStatus = stuntingResult;

    } catch (error) {
      console.error("Error calling stunting API:", error);
      // Hentikan proses dan kirim error
      return res.status(500).json({ error: `Failed to get stunting status from API (Stunting Check). Detail: ${error.message}` });
    }

    // --- 2. Panggil API untuk mendapatkan Z-Score ---
    let zscore;
    try {
      // Kelamin sudah dihitung di atas
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        kelaminUntukAPI = 'l';
      }

      const zResponse = await fetch(`${process.env.ML_API_URL}/zscore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usiaBulan: usiaInMonths,
          tinggi: parseFloat(tinggiBadan),
          kelamin: kelaminUntukAPI,
        }),
      });

      if (!zResponse.ok) {
        const errorText = await zResponse.text();
        console.error(`API Error Response (Z-Score): ${errorText}`);
        throw new Error(`HTTP error! status: ${zResponse.status}`);
      }

      const zResult = await zResponse.json();
      // !!! PERBAIKAN: Ambil nilai langsung karena Python API mereturn float
      zscore = zResult;

    } catch (error) {
      console.error("Error calling Z-score API:", error);
      // Hentikan proses dan kirim error
      return res.status(500).json({ error: "Failed to get Z-score from API." });
    }

    console.log(`Stunting Status (String): ${stuntingStatus}`);
    console.log(`Z-Score (Float): ${zscore}`);

    // Penyesuaian nilai string untuk database (jika diperlukan oleh Enum/StuntingType Prisma)
    if (stuntingStatus === "Sangat Pendek") {
      stuntingStatus = "SangatPendek";
    }

    const anakIbuData = {
      nama: nama,
      jenisKelamin: jenisKelamin,
      emailIbu: email,
      usia: usia, // Tetap gunakan tanggal lahir (string ISO)
      beratBadanL: parseFloat(bbLahir),
      tinggiBadanL: parseFloat(tbLahir),
      beratBadan: parseFloat(beratBadan),
      tinggiBadan: parseFloat(tinggiBadan),
      anemia: false, // Disetel ke false karena tidak ada pemeriksaan anemia di sini
      stunting: stuntingStatus, // Sekarang adalah String/Enum
      zscore: zscore,           // Sekarang adalah Float
      cekMingguan: true,
    };

    // Create AnakIbu record
    const anakIbuRecord = await prisma.anakIbu.create({
      data: anakIbuData,
    });

    // Create Initial Recap (Data Pendaftaran)
    await prisma.recapAnak.create({
      data: {
        anakIbuId: anakIbuRecord.id,
        tanggal: new Date(),
        beratBadan: parseFloat(beratBadan),
        tinggiBadan: parseFloat(tinggiBadan),
        usia: usiaInMonths,
        anemia: false,
        stunting: stuntingStatus,
        konjungtivitasNormal: true,
        kukuBersih: true,
        riwayatAnemia: false,
        tampakLemas: false,
        tampakPucat: false,
        rekomendasi: "Data pendaftaran awal. Belum ada rekomendasi dari asisten AI.",
      }
    });

    // Update IbuRumah agar bisa langsung melakukan cek
    await prisma.ibuRumah.update({
      where: { email: email },
      data: { cekAnak: true }
    });

    res.status(201).json({
      message: "Anak added successfully.",
      anakKader: anakIbuRecord,
    });

  } catch (error) {
    console.error("Error adding anak:", error);
    res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};

const editAnakIbu = async (req, res) => {
  try {
    const {
      id,
      email,
      nama,
      beratBadan,
      tinggiBadan,
      beratBadanL,
      tinggiBadanL,
      jenisKelamin,
      usia,
    } = req.body;

    // Pastikan ID tersedia
    if (!id) {
      return res.status(400).json({ error: "ID anak harus disediakan untuk pembaruan." });
    }

    const today = dayjs();
    const birthDate = dayjs(usia);
    const usiaInMonths = today.diff(birthDate, 'month');

    // --- Panggil API untuk memeriksa stunting ---
    let stuntingStatus;
    try {
      // Mengubah jenis kelamin menjadi 'l' atau 'p' sebelum dikirim ke API
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        console.warn("Invalid 'jenisKelamin' value. Defaulting to 'l'.");
        kelaminUntukAPI = 'l';
      }

      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usiaBulan: usiaInMonths,
          tinggi: parseFloat(tinggiBadan),
          kelamin: kelaminUntukAPI,
        }),
      });

      if (!stuntingResponse.ok) {
        const errorText = await stuntingResponse.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${stuntingResponse.status}`);
      }

      const stuntingResult = await stuntingResponse.json();
      stuntingStatus = stuntingResult;

    } catch (error) {
      console.error("Error calling stunting API:", error);
      // Hentikan proses dan kirim error
      return res.status(500).json({ error: "Failed to get stunting status from API." });
    }

    console.log(`Stunting Status (String): ${stuntingStatus}`);

    // Penyesuaian nilai string untuk database (jika diperlukan oleh Enum/StuntingType Prisma)
    if (stuntingStatus === "Sangat Pendek") {
      stuntingStatus = "SangatPendek";
    }

    const anakIbuData = {
      nama: nama,
      jenisKelamin: jenisKelamin,
      emailIbu: email,
      usia: usia,
      beratBadan: parseFloat(beratBadan),
      tinggiBadan: parseFloat(tinggiBadan),
      beratBadanL: parseFloat(beratBadanL),
      tinggiBadanL: parseFloat(tinggiBadanL),
      stunting: stuntingStatus, // Sekarang adalah String/Enum
    };

    // Update the AnakIbu record based on the provided ID
    const anakIbuRecord = await prisma.anakIbu.update({
      where: {
        id: id,
      },
      data: anakIbuData,
    });

    res.status(201).json({ // Menggunakan 200 OK untuk update
      message: "Anak updated successfully.",
      anakKader: anakIbuRecord,
    });
  } catch (error) {
    console.error("Error updating anak:", error);
    // Jika error sudah ditangani dan respons dikirim di blok catch internal,
    // maka error di sini adalah error yang tidak terduga.
    res.status(500).json({
      error: "Internal Server Error"
    });
  }
};

const getAllAnak = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const recap = await prisma.anakIbu.findMany({
      where: { emailIbu: email },
    });

    res.status(200).json(recap || { message: "No recap found for this Ibu." });


  } catch (error) {
    console.error("Error updating kader:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const editIbu = async (req, res) => {
  try {
    const {
      nama,
      usia,
      noTelp,
      posyanduId,
      provinsi,
      kota,
      kecamatan,
      kelurahan,
      rt,
      rw,
      alamat,
      email, // Pastikan email ini datang dari body untuk identifikasi user yang akan diupdate
    } = req.body;

    // Pastikan semua field yang ingin diupdate ada di req.body
    // Jika ada field lain seperti 'name', 'phone', 'address' yang juga ingin diupdate,
    // pastikan itu juga disertakan di req.body dan skema Prisma Anda.
    const updatedKader = await prisma.ibuRumah.update({
      where: { email: email }, // Menggunakan email dari req.body sebagai kriteria WHERE
      data: {
        nama: nama,
        usia: usia,
        noTelp: noTelp,
        posyanduId: posyanduId || undefined,
        provinsi: provinsi,
        kota: kota,
        kecamatan: kecamatan,
        kelurahan: kelurahan,
        rt: rt,
        rw: rw,
        alamat: alamat,
      },
    });

    res.status(200).json(updatedKader);
  } catch (error) {
    console.error("Error updating kader:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getRecapAnakMonthly = async (req, res) => {
  try {
    const { ibuId, month, year } = req.body;
    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);

    if (!ibuId || isNaN(parsedMonth) || isNaN(parsedYear)) {
      return res.status(400).json({ error: "ibuId, month, and year are required and must be valid numbers." });
    }

    const RecapMonth = await prisma.recapAnak.findMany({
      where: {
        anakIbu: {
          emailIbu: ibuId,
        },
        tanggal: {
          gte: new Date(month, parsedMonth - 1, 1),
          lt: new Date(parsedYear, parsedMonth, 1),
        },
      },
      // Tambahkan 'include' untuk mengambil data dari relasi 'anakIbu'
      include: {
        anakIbu: {
          select: {
            emailIbu: true,
            nama: true,
            jenisKelamin: true,
            id: true,
            usia: true,
          },
        },
      },
      orderBy: [
        { tanggal: 'desc' },
        { anakIbu: { usia: 'asc' } }
      ]
    });

    // Dapatkan urutan anak berdasarkan usia (tanggal lahir)
    const allAnak = await prisma.anakIbu.findMany({
      where: { emailIbu: ibuId },
      orderBy: { usia: 'asc' }, // yang lahir duluan (tanggal terkecil) jadi anak pertama
      select: { id: true }
    });

    const anakOrderMap = {};
    allAnak.forEach((anak, index) => {
      anakOrderMap[anak.id] = index + 1;
    });

    // Ubah struktur data agar nama ibu berada di level yang sama
    const formattedRecap = RecapMonth.map(recap => {
      const nama = recap.anakIbu.nama;
      const jenisKelamin = recap.anakIbu.jenisKelamin;
      const id = recap.anakIbu.id;
      const childNumber = anakOrderMap[id] || 1;
      // Hapus objek relasi aslinya untuk menjaga struktur tetap datar
      delete recap.anakIbu;
      return {
        ...recap,
        tanggal: toWIB(recap.tanggal),
        nama: nama,
        jenisKelamin: jenisKelamin,
        id: id,
        childNumber: childNumber,
      };
    });

    // Urutkan ulang secara eksplisit (berjaga-jaga jika ada masalah dengan Prisma relation sorting)
    formattedRecap.sort((a, b) => {
      // 1. Waktu terbaru riwayat cek (descending), absolut hingga menit dan detik
      const dateA = new Date(a.tanggal).getTime();
      const dateB = new Date(b.tanggal).getTime();
      
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      // 2. Urutan anak keberapa (ascending)
      return (a.childNumber || 0) - (b.childNumber || 0);
    });

    // Tandai hanya 1 riwayat terbaru per anak yang bisa diedit
    const seenAnakIds = new Set();
    formattedRecap.forEach(recap => {
      if (!seenAnakIds.has(recap.id)) {
        recap.isEditable = true;
        seenAnakIds.add(recap.id);
      } else {
        recap.isEditable = false;
      }
    });

    return res.status(200).json(formattedRecap);

  } catch (error) {
    console.error("Error fetching monthly recap:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getRecapAnakbyId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    // Mengambil recap anak berdasarkan ID yang diberikan (kodeRecap)
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
            beratBadanL: true,
            tinggiBadanL: true,
            ibu: {
              select: {
                nama: true
              }
            }
          }
        }
      }
    });

    if (!currentRecap) {
      return res.status(404).json({ message: "No recap found with this ID." });
    }

    // Mencari recap sebelumnya untuk anak yang sama
    let previousRecap = await prisma.recapAnak.findFirst({
      where: {
        anakIbuId: currentRecap.anakIbuId,
        tanggal: {
          lt: currentRecap.tanggal, // Mencari tanggal yang lebih kecil (sebelum) dari tanggal recap saat ini
        },
      },
      orderBy: {
        tanggal: 'desc', // Mengurutkan dari yang paling baru ke yang paling lama
      },
    });

    if (!previousRecap) {
      // Fallback: Jika ini adalah cek kesehatan pertama dan belum ada recap pendaftaran (untuk user lama)
      // Gunakan data lahir (L) sebagai data sebelumnya agar UI tidak menampilkan angka 0
      previousRecap = {
        beratBadan: currentRecap.anakIbu.beratBadanL,
        tinggiBadan: currentRecap.anakIbu.tinggiBadanL,
      };
    }

    if (currentRecap && currentRecap.tanggal) {
      currentRecap.tanggal = toWIB(currentRecap.tanggal);
    }
    if (previousRecap && previousRecap.tanggal) {
      previousRecap.tanggal = toWIB(previousRecap.tanggal);
    }

    // Menggabungkan data recap saat ini dan recap sebelumnya ke dalam satu objek
    const responseData = {
      currentRecap,
      previousRecap,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching recap:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const cekMakanan = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Tidak ada file gambar yang diunggah.' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path), file.originalname);

    const yoloResponse = await axios.post(`${process.env.ML_API_URL}/yolo`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    // Ambil data prediksi dari respons YOLO
    const predictions = yoloResponse.data.predictions;

    // Gunakan Set untuk menyimpan label unik
    const uniqueLabels = new Set();

    // Iterasi melalui prediksi dan tambahkan setiap label ke Set
    for (const prediction of predictions) {
      uniqueLabels.add(prediction.label);
    }

    // Ubah Set menjadi array untuk respons akhir
    const labelsArray = Array.from(uniqueLabels);

    // Hapus file sementara setelah dikirim
    fs.unlinkSync(file.path);

    // Kirim respons dengan array label unik
    res.status(yoloResponse.status).json(labelsArray);

  } catch (error) {
    console.error('Error saat meneruskan permintaan ke YOLO:', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
  }
};

const addRecapAnak = async (req, res) => {
  try {
    const { anakId, tanggal, beratBadan, tinggiBadan, usia, jenisKelamin, konjungtivitaNormal, kukuBersih, riwayatAnemia, tampakLemas, tampakPucat, email
    } = req.body;

    console.log(usia);
    console.log(konjungtivitaNormal)
    console.log(kukuBersih)
    console.log(riwayatAnemia)
    console.log(tampakLemas)
    console.log(tampakPucat);

    // --- 0. Idempotency Check (Pencegahan Duplikat per Hari) ---
    // Cegah anak yang sama membuat riwayat baru lebih dari 1 kali di hari yang sama
    if (anakId && tanggal) {
      const targetDate = new Date(tanggal);
      
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0,0,0,0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23,59,59,999);

      const existingRecap = await prisma.recapAnak.findFirst({
        where: {
          anakIbuId: anakId,
          tanggal: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });

      if (existingRecap) {
        console.log(`[Idempotency] Anak ${anakId} sudah dicek hari ini (${startOfDay.toLocaleDateString()}). Mengabaikan duplikat.`);
        return res.status(200).json({ message: "Data kesehatan untuk hari ini sudah berhasil disimpan sebelumnya. Gunakan Edit jika ada kesalahan." });
      }
    }

    // Ubah ke float, jangan string (toFixed(1) mengembalikan string)
    const newBeratBadanFloat = parseFloat(beratBadan);
    const newTinggiBadanFloat = parseFloat(tinggiBadan);

    // --- 1. Panggil API untuk memeriksa anemia ---
    let isAnemic;
    try {
      const anemiaResponse = await fetch(`${process.env.ML_API_URL}/anemia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lemas: tampakLemas,
          riwayat: riwayatAnemia,
          konjungtiva: konjungtivitaNormal,
          kuku: kukuBersih,
        }),
      });

      if (!anemiaResponse.ok) {
        throw new Error(`HTTP error! status: ${anemiaResponse.status}`);
      }

      const anemiaResult = await anemiaResponse.json();
      // PERBAIKAN: Ambil nilai Boolean langsung karena API mereturn nilai primitif
      isAnemic = anemiaResult;

    } catch (error) {
      console.error("Error calling anemia API:", error);
      return res.status(500).json({ error: "Failed to get anemia status from API." });
    }

    // --- 2. Panggil API untuk memeriksa stunting ---
    let stuntingStatus;
    try {
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        console.warn("Invalid 'jenisKelamin' value. Defaulting to 'l'.");
        kelaminUntukAPI = 'l';
      }

      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usiaBulan: usia,
          tinggi: newTinggiBadanFloat,
          kelamin: kelaminUntukAPI,
        }),
      });

      if (!stuntingResponse.ok) {
        const errorText = await stuntingResponse.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${stuntingResponse.status}`);
      }

      const stuntingResult = await stuntingResponse.json();
      // PERBAIKAN: Ambil nilai String langsung
      stuntingStatus = stuntingResult;

    } catch (error) {
      console.error("Error calling stunting API:", error);
      return res.status(500).json({ error: "Failed to get stunting status from API." });
    }

    // Penyesuaian nilai string untuk database (jika diperlukan oleh enum Prisma)
    if (stuntingStatus === "Sangat Pendek") {
      stuntingStatus = "SangatPendek";
    }

    // --- 3. Panggil API untuk Z-Score ---
    let zscore;
    try {
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        console.warn("Invalid 'jenisKelamin' value. Defaulting to 'l'.");
        kelaminUntukAPI = 'l';
      }

      const zResponse = await fetch(`${process.env.ML_API_URL}/zscore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usiaBulan: usia,
          tinggi: newTinggiBadanFloat,
          kelamin: kelaminUntukAPI,
        }),
      });

      if (!zResponse.ok) {
        const errorText = await zResponse.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${zResponse.status}`);
      }

      const zResult = await zResponse.json();
      // PERBAIKAN: Ambil nilai numerik langsung
      zscore = zResult;

    } catch (error) {
      console.error("Error calling zscore API:", error);
      return res.status(500).json({ error: "Failed to get zscore from API." });
    }

    console.log(`Stunting Status (String): ${stuntingStatus}`);
    console.log(`Anemia Status (Boolean): ${isAnemic}`);
    console.log(`Z-Score (Number): ${zscore}`);

    let namaAnak = "Anak";
    let namaIbu = "Ibu";
    try {
      const anakRecord = await prisma.anakIbu.findUnique({
        where: { id: anakId },
      });
      if (anakRecord) {
        namaAnak = anakRecord.nama;
      }
      if (req.user && req.user.nama) {
        namaIbu = req.user.nama;
      }
    } catch (e) {
      console.log("Error fetching anak record for placeholder", e);
    }

    const imt = (newBeratBadanFloat / Math.pow(newTinggiBadanFloat / 100, 2)).toFixed(2);

    const rekomendasiPlaceholder = `## Informasi Umum
- Nama Anak: ${namaAnak}
- Jenis Kelamin: ${jenisKelamin}
- Usia: ${usia} bulan
- Berat Badan: ${newBeratBadanFloat} kg
- Tinggi Badan: ${newTinggiBadanFloat} cm
- Ibu: ${namaIbu}

## Analisis Pertumbuhan
Berdasarkan data yang diberikan, anak berusia ${usia} bulan dengan berat badan ${newBeratBadanFloat} kg dan tinggi badan ${newTinggiBadanFloat} cm menunjukkan:
- Indeks Massa Tubuh (IMT): ${newBeratBadanFloat} kg / (${newTinggiBadanFloat / 100} m)^2 = ${imt}
- Stunting: Tinggi badan anak berada dalam kategori ${stuntingStatus}.

## Rekomendasi
- *(Analisis cerdas sedang diproses. Silakan refresh aplikasi nanti untuk melihat rekomendasi gizi lengkap dari AI).*

## Analisis Anemia
- Status Anemia: ${isAnemic ? 'Terindikasi anemia. Perlu perhatian khusus.' : 'Tidak ada anemia terdeteksi. Ini adalah kabar baik.'}

## Analisis Kebersihan & Kondisi Fisik
- Kuku: ${kukuBersih ? 'Bersih' : 'Tidak bersih'}
- Konjungtiva: ${konjungtivitaNormal ? 'Normal' : 'Tidak normal'}`;

    // Data untuk membuat record baru di recapAnak
    const anakIbuData = {
      anakIbuId: anakId,
      tanggal: new Date(tanggal),
      beratBadan: newBeratBadanFloat,
      tinggiBadan: newTinggiBadanFloat,
      usia: usia,
      anemia: isAnemic,
      stunting: stuntingStatus, // Sekarang adalah String/Enum yang valid
      konjungtivitasNormal: konjungtivitaNormal,
      kukuBersih: kukuBersih,
      riwayatAnemia: riwayatAnemia,
      tampakLemas: tampakLemas,
      tampakPucat: tampakPucat,
      rekomendasi: rekomendasiPlaceholder,
    };

    // Create recapAnak record
    const anakIbuRecord = await prisma.recapAnak.create({
      data: anakIbuData,
    });

    // Update record anakIbu
    const updateAnakIbu = await prisma.anakIbu.update({
      where: { id: anakId },
      data: {
        anemia: isAnemic, // PERBAIKAN: Menggunakan 'isAnemic'
        stunting: stuntingStatus,
        beratBadan: newBeratBadanFloat,
        tinggiBadan: newTinggiBadanFloat,
        cekMingguan: false,
        zscore: zscore,
      },
    });

    const checkmingguan = await prisma.anakIbu.findMany({
      where: {
        emailIbu: email,
        cekMingguan: true,
      },
    });

    if (checkmingguan.length === 0) {
      const updateIbu = await prisma.ibuRumah.update({
        where: { email: email },
        data: {
          cekAnak: false,
        },
      });
    }

    res.status(201).json({
      message: "Data anak berhasil diunggah dan diperbarui.",
      anakIbu: anakIbuRecord,
      updateAnakIbu: updateAnakIbu,
    });

  } catch (error) {
    console.error("Error updating recap anak:", error);
    // Jika error sudah ditangani di catch internal, ini mungkin tidak perlu, tapi bagus untuk fallback
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const getAllArticle = async (req, res) => {
  try {
    const AllArticle = await prisma.artikel.findMany({
      select: {
        id: true,
        judul: true,
        tanggal: true,
        tags: true,
        gambar: true,
      },
    });

    res.status(200).json(AllArticle);
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getArticlebyId = async (req, res) => {
  try {
    const { id } = req.params;
    // Mengambil recap anak berdasarkan ID yang diberikan (kodeRecap)
    const ArticleDetail = await prisma.artikel.findUnique({
      where: {
        id: id
      }, include: {
        tags: true
      }
    })

    res.status(200).json(ArticleDetail);
  } catch (error) {
    console.error("Error fetching recap:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

async function resetIbuRumahChecks() {
  try {
    // 1. Ambil Tanggal Target Global dari DB
    const schedule = await prisma.globalSchedule.findUnique({
      where: { key: '1' },
    });

    if (!schedule) {
      console.error("GlobalSchedule 'CHECK_RESET_DATE' tidak ditemukan. Mohon inisialisasi baris pertama di database.");
      return;
    }

    // Kita hanya tertarik pada tanggal (tanpa jam/menit), jadi kita mulai dari awal hari
    const todayStart = startOfDay(new Date());
    const targetDateStart = startOfDay(schedule.value_date);

    // 2. Cek Apakah Sudah Waktunya (Hari Target SUDAH TERCAPAI atau LEWAT)
    // isPast akan mengembalikan true jika targetDateStart lebih dahulu dari todayStart
    if (isPast(targetDateStart) || targetDateStart.getTime() === todayStart.getTime()) {

      console.log(`[CRON] Tanggal ${targetDateStart.toISOString()} sudah tercapai. Melakukan reset massal...`);

      // 3. Jalankan UPDATE Massal di Database
      // Mereset cekAnak dan sanitasi menjadi TRUE untuk SEMUA IbuRumah
      const updateResult = await prisma.ibuRumah.updateMany({
        data: {
          cekAnak: true,
          sanitasi: true,
        },
      });

      // Mereset cekMingguan menjadi TRUE untuk SEMUA Anak
      const updateAnak = await prisma.anakIbu.updateMany({
        data: {
          cekMingguan: true,
        }
      });

      console.log(`[CRON] Berhasil mereset ${updateResult.count} data IbuRumah dan ${updateAnak.count} data AnakIbu.`);

      // 4. Hitung Tanggal Target Baru (+14 hari dari TANGGAL TARGET LAMA)
      // Penting: Selalu tambahkan 14 hari sampai target baru berada di masa depan
      // Menggunakan epoch math agar komponen jam (T17:00 UTC) tidak terhapus oleh startOfDay
      let newTargetDate = new Date(schedule.value_date.getTime() + DAYS_TO_ADD * 24 * 60 * 60 * 1000);
      const nowMs = new Date().getTime();
      while (newTargetDate.getTime() <= nowMs) {
        newTargetDate = new Date(newTargetDate.getTime() + DAYS_TO_ADD * 24 * 60 * 60 * 1000);
      }

      // 5. Update Tanggal Target Global di DB
      await prisma.globalSchedule.update({
        where: { key: '1' },
        data: {
          value_date: newTargetDate,
          last_execution: new Date(),
        },
      });

      console.log(`[CRON] Jadwal berikutnya diset pada: ${newTargetDate.toISOString()}`);
    } else {
      console.log(`[CRON] Belum waktunya reset. Target berikutnya: ${targetDateStart.toISOString()}`);
    }
  } catch (error) {
    console.error("[CRON] Gagal menjalankan resetIbuRumahChecks:", error);
  }
}


const getBatchAllAnak = async (req, res) => {
  try {
    const AllAnak = await prisma.anakIbu.findMany();
    res.status(200).json(AllAnak);
  }
  catch (error) {
    console.error("Error fetching anak:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const editRecapAnakIbu = async (req, res) => {
  try {
    const { id } = req.params; // kodeRecap
    const {
      beratBadan,
      tinggiBadan,
      konjungtivitaNormal,
      kukuBersih,
      tampakLemas,
      tampakPucat,
      riwayatAnemia,
    } = req.body;

    if (!id) return res.status(400).json({ error: "ID is required." });

    // Cek keberadaan recap
    const recap = await prisma.recapAnak.findUnique({
      where: { kodeRecap: id },
      include: { anakIbu: true }
    });

    if (!recap) return res.status(404).json({ error: "Recap not found." });

    // Validasi 7 hari
    const recapDate = new Date(recap.tanggal);
    const today = new Date();
    const diffTime = Math.abs(today - recapDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      return res.status(400).json({ error: "Data ini sudah lewat 7 hari dan tidak dapat diedit lagi." });
    }

    // Validasi data terbaru
    const latestRecap = await prisma.recapAnak.findFirst({
      where: { anakIbuId: recap.anakIbuId },
      orderBy: { tanggal: 'desc' },
    });

    if (latestRecap.kodeRecap !== id) {
      return res.status(400).json({ error: "Hanya riwayat terbaru yang dapat diedit." });
    }

    const newBeratBadanFloat = parseFloat(beratBadan);
    const newTinggiBadanFloat = parseFloat(tinggiBadan);
    const anakIbu = recap.anakIbu;

    // --- 1. Panggil API Anemia ---
    let isAnemic;
    try {
      const anemiaResponse = await fetch(`${process.env.ML_API_URL}/anemia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lemas: tampakLemas,
          riwayat: riwayatAnemia,
          konjungtiva: konjungtivitaNormal,
          kuku: kukuBersih,
        }),
      });
      if (!anemiaResponse.ok) throw new Error("Anemia API Error");
      isAnemic = await anemiaResponse.json();
    } catch (e) {
      return res.status(500).json({ error: "Failed calling anemia API" });
    }

    // --- 2. Panggil API Stunting ---
    let stuntingStatus;
    try {
      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usiaBulan: recap.usia,
          tinggi: newTinggiBadanFloat,
          kelamin: anakIbu.jenisKelamin === 'Laki-laki' ? 'l' : 'p',
        }),
      });
      if (!stuntingResponse.ok) throw new Error("Stunting API Error");
      stuntingStatus = await stuntingResponse.json();
      if (stuntingStatus === "Sangat Pendek") stuntingStatus = "SangatPendek";
    } catch (e) {
      return res.status(500).json({ error: "Failed calling stunting API" });
    }

    // --- 3. Panggil API Z-score ---
    let zscore;
    try {
      const zResponse = await fetch(`${process.env.ML_API_URL}/zscore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usiaBulan: recap.usia,
          tinggi: newTinggiBadanFloat,
          kelamin: anakIbu.jenisKelamin === 'Laki-laki' ? 'l' : 'p',
        }),
      });
      if (!zResponse.ok) throw new Error("ZScore API Error");
      zscore = await zResponse.json();
    } catch (e) {
      return res.status(500).json({ error: "Failed calling zscore API" });
    }

    // Update Recap
    const updatedRecap = await prisma.recapAnak.update({
      where: { kodeRecap: id },
      data: {
        beratBadan: newBeratBadanFloat,
        tinggiBadan: newTinggiBadanFloat,
        konjungtivitasNormal: konjungtivitaNormal,
        kukuBersih: kukuBersih,
        tampakLemas: tampakLemas,
        tampakPucat: tampakPucat,
        riwayatAnemia: riwayatAnemia,
        anemia: isAnemic,
        stunting: stuntingStatus,
      }
    });

    // Update AnakIbu
    await prisma.anakIbu.update({
      where: { id: anakIbu.id },
      data: {
        anemia: isAnemic,
        stunting: stuntingStatus,
        beratBadan: newBeratBadanFloat,
        tinggiBadan: newTinggiBadanFloat,
        zscore: zscore,
      }
    });

    res.status(200).json({ message: "Data berhasil diedit.", updatedRecap });

  } catch (error) {
    console.error("Error editing recap:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const tambahRecapAnakOlehKader = async (req, res) => {
  try {
    const {
      anakId,
      tanggal,
      usia,
      beratBadan,
      tinggiBadan,
      konjungtivitaNormal,
      kukuBersih,
      tampakLemas,
      tampakPucat,
      riwayatAnemia,
    } = req.body;

    const newBeratBadanFloat = parseFloat(beratBadan);
    const newTinggiBadanFloat = parseFloat(tinggiBadan);

    const anakRecord = await prisma.anakIbu.findUnique({
      where: { id: anakId },
      include: { ibu: true }
    });

    if (!anakRecord) return res.status(404).json({ error: "Anak not found" });

    // --- 1. Panggil API Anemia ---
    let isAnemic;
    try {
      const anemiaResponse = await fetch(`${process.env.ML_API_URL}/anemia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lemas: tampakLemas,
          riwayat: riwayatAnemia,
          konjungtiva: konjungtivitaNormal,
          kuku: kukuBersih,
        }),
      });
      if (!anemiaResponse.ok) throw new Error("Anemia API Error");
      isAnemic = await anemiaResponse.json();
    } catch (e) {
      return res.status(500).json({ error: "Failed calling anemia API" });
    }

    // --- 2. Panggil API Stunting ---
    let stuntingStatus;
    try {
      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usiaBulan: usia,
          tinggi: newTinggiBadanFloat,
          kelamin: anakRecord.jenisKelamin === 'Laki-laki' ? 'l' : 'p',
        }),
      });
      if (!stuntingResponse.ok) throw new Error("Stunting API Error");
      stuntingStatus = await stuntingResponse.json();
      if (stuntingStatus === "Sangat Pendek") stuntingStatus = "SangatPendek";
    } catch (e) {
      return res.status(500).json({ error: "Failed calling stunting API" });
    }

    // --- 3. Panggil API Z-score ---
    let zscore;
    try {
      const zResponse = await fetch(`${process.env.ML_API_URL}/zscore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usiaBulan: usia,
          tinggi: newTinggiBadanFloat,
          kelamin: anakRecord.jenisKelamin === 'Laki-laki' ? 'l' : 'p',
        }),
      });
      if (!zResponse.ok) throw new Error("ZScore API Error");
      zscore = await zResponse.json();
    } catch (e) {
      return res.status(500).json({ error: "Failed calling zscore API" });
    }

    const imt = (newBeratBadanFloat / Math.pow(newTinggiBadanFloat / 100, 2)).toFixed(2);
    const rekomendasiPlaceholder = `## Informasi Umum
- Nama Anak: ${anakRecord.nama}
- Jenis Kelamin: ${anakRecord.jenisKelamin}
- Usia: ${usia} bulan
- Berat Badan: ${newBeratBadanFloat} kg
- Tinggi Badan: ${newTinggiBadanFloat} cm
- Ibu: ${anakRecord.ibu.nama}

## Analisis Pertumbuhan
Berdasarkan data yang diberikan, anak berusia ${usia} bulan dengan berat badan ${newBeratBadanFloat} kg dan tinggi badan ${newTinggiBadanFloat} cm menunjukkan:
- Indeks Massa Tubuh (IMT): ${imt}
- Stunting: Tinggi badan anak berada dalam kategori ${stuntingStatus}.

## Rekomendasi
- *(Analisis cerdas sedang diproses. Silakan refresh aplikasi nanti untuk melihat rekomendasi gizi lengkap dari AI).*

## Analisis Anemia
- Status Anemia: ${isAnemic ? 'Terindikasi anemia. Perlu perhatian khusus.' : 'Tidak ada anemia terdeteksi. Ini adalah kabar baik.'}

## Analisis Kebersihan & Kondisi Fisik
- Kuku: ${kukuBersih ? 'Bersih' : 'Tidak bersih'}
- Konjungtiva: ${konjungtivitaNormal ? 'Normal' : 'Tidak normal'}`;

    const anakIbuData = {
      anakIbuId: anakId,
      tanggal: new Date(tanggal),
      beratBadan: newBeratBadanFloat,
      tinggiBadan: newTinggiBadanFloat,
      usia: usia,
      anemia: isAnemic,
      stunting: stuntingStatus,
      konjungtivitasNormal: konjungtivitaNormal,
      kukuBersih: kukuBersih,
      riwayatAnemia: riwayatAnemia,
      tampakLemas: tampakLemas,
      tampakPucat: tampakPucat,
      rekomendasi: rekomendasiPlaceholder,
    };

    const newRecap = await prisma.recapAnak.create({ data: anakIbuData });

    // OPTION A: Set cekMingguan to false, locking the Ibu from doing her own check
    await prisma.anakIbu.update({
      where: { id: anakId },
      data: {
        anemia: isAnemic,
        stunting: stuntingStatus,
        beratBadan: newBeratBadanFloat,
        tinggiBadan: newTinggiBadanFloat,
        zscore: zscore,
        cekMingguan: false, // LOCK IBU
      },
    });

    res.status(201).json({ message: "Anak checked by Kader successfully", anakIbu: newRecap });

  } catch (error) {
    console.error("Error in tambahRecapAnakOlehKader:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getIbu,
  editIbu,
  addAnak,
  getAllAnak,
  getAnakIbubyId,
  editAnakIbu,
  deleteAnakbyId,
  addRecapAnak,
  getRecapAnakbyId,
  getRecapAnakMonthly,
  getAllRecapAnak,
  getDashboardAnak,
  cekMakanan,
  getAllArticle,
  getArticlebyId,
  resetIbuRumahChecks,
  getBatchAllAnak,
  editRecapAnakIbu,
  tambahRecapAnakOlehKader,
};