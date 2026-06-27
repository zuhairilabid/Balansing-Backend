// controllers/user.controller.js

const { PrismaClient } = require("@prisma/client");
const ClientError = require("../errors/ClientError");
const { createClient } = require('@supabase/supabase-js');
// const bcrypt = require('bcryptjs'); // Tidak perlu lagi jika Supabase yang menghash
const crypto = require('crypto');
const passport = require('../passport'); // Jika Anda menggunakan passport
const jwt = require('jsonwebtoken');
const { get } = require("http");

// Supabase Client untuk sisi client (jika Anda menggunakannya di backend untuk beberapa kasus)
// Biasanya ini untuk operasi yang memerlukan kunci ANON_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); // <--- PERBAIKAN: Gunakan ANON_KEY

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

const prisma = new PrismaClient();


const getKader = async (req, res) => {
  try {
    const { email } = req.params;

    // Validate email if necessary (e.g., check for valid email format)
    if (!email) {
      return res.status(400).json({ error: "Email parameter is required." });
    }

    const kader = await prisma.kader.findUnique({
      where: { email },
    });

    if (!kader) {
      // If no kader is found with the given email
      return res.status(404).json({ error: "Kader not found." });
    }

    // If kader is found, send it as a JSON response
    res.status(200).json(kader);

  } catch (error) {
    console.error("Error fetching kader:", error); // Log the error for debugging
    res.status(500).json({ error: "Internal Server Error" });
  }
};    

const editKader = async (req, res) => {
  try {
    const {
      namaPuskesmas,
      namaPosyandu,
      provinsi,
      kota,
      kecamatan,
      kelurahan,
      rt,
      rw,
      email, // Pastikan email ini datang dari body untuk identifikasi user yang akan diupdate
    } = req.body;

    // Pastikan semua field yang ingin diupdate ada di req.body
    // Jika ada field lain seperti 'name', 'phone', 'address' yang juga ingin diupdate,
    // pastikan itu juga disertakan di req.body dan skema Prisma Anda.
    const updatedKader = await prisma.kader.update({
      where: { email: email }, // Menggunakan email dari req.body sebagai kriteria WHERE
      data: {
        namaPuskesmas: namaPuskesmas,
        namaPosyandu: namaPosyandu,
        provinsi: provinsi,
        kota: kota,
        kecamatan: kecamatan,
        kelurahan: kelurahan,
        rt: rt,
        rw: rw,
      },
    });

    res.status(200).json(updatedKader);
  } catch (error) {
    console.error("Error updating kader:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getRecap = async (req, res) => {
  try {
    const { email } = req.params; // Assuming email is available in req.user from JWT authentication
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const recap = await prisma.anakKader.findMany({
      where: { kaderEmail: email },
    });

    res.status(200).json(recap || { message: "No recap found for this kader." });
  } catch (error) {
    console.error("Error fetching recap:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const getRecapById = async (req, res) => {
  try {
    const { id } = req.params; // Assuming id is the unique identifier for AnakKader
    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    const recap = await prisma.anakKader.findUnique({
      where: { id: id }, // Ensure id is parsed to an integer if it's a number
    });

    if (!recap) {
      return res.status(200).json({ message: "No recap found with this ID." });
    }

    // Assuming 'usia' is the property that stores the age in months
    const totalMonths = recap.usia; 
    const umurTahun = Math.floor(totalMonths / 12);
    const umurBulan = totalMonths % 12;

    const recapWithAge = {
      ...recap,
      umurBulan,
      umurTahun,
    };

    res.status(200).json(recapWithAge);
  } catch (error) {
    console.error("Error fetching recap by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

const unggahAnak = async (req, res) => {
  try {
    const {
      email,
      tanggalPemeriksaan,
      namaIbu,
      namaAnak,
      umurTahun,
      umurBulan,
      beratBadan,
      tinggiBadan,
      jenisKelamin,
      konjungtivitaNormal,
      kukuBersih,
      tampakLemas,
      tampakPucat,
      riwayatAnemia,
    } = req.body;

    console.log(konjungtivitaNormal, kukuBersih, tampakLemas, tampakPucat, riwayatAnemia);

    const usiaInMonths = (parseInt(umurTahun) * 12) + parseInt(umurBulan);

    // Validasi Usia Balita (Maksimal 60 bulan / 5 tahun)
    if (usiaInMonths > 60) {
      return res.status(400).json({ message: "Usia anak tidak boleh lebih dari 60 bulan (5 tahun) untuk pemeriksaan Stunting." });
    }

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
          tampakPucat: tampakPucat,
        }),
      });

      if (!anemiaResponse.ok) {
        throw new Error(`HTTP error! status: ${anemiaResponse.status}`);
      }

      const anemiaResult = await anemiaResponse.json();
      isAnemic = anemiaResult; 
      
    } catch (error) {
      console.error("Error calling anemia API:", error);
      // Lempar error untuk menghentikan proses unggah jika API gagal
      return res.status(500).json({ error: "Failed to get anemia status from API." });
    }

    // --- 2. Panggil API untuk memeriksa stunting ---
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
      // Lempar error untuk menghentikan proses unggah jika API gagal
      return res.status(500).json({ error: "Failed to get stunting status from API." });
    }

    console.log(`Anemia Status (Boolean): ${isAnemic}`);
    console.log(`Stunting Status (String): ${stuntingStatus}`);

    // Penyesuaian nilai string untuk database (jika diperlukan oleh enum Prisma)
    if(stuntingStatus === "Sangat Pendek"){
      stuntingStatus = "SangatPendek";
    }

    const anakKaderData = {
      nama: namaAnak,
      jenisKelamin: jenisKelamin,
      namaIbu: namaIbu,
      usia: usiaInMonths,
      beratBadan: parseFloat(beratBadan),
      tinggiBadan: parseFloat(tinggiBadan),
      anemia: isAnemic,         // Sekarang adalah Boolean
      stunting: stuntingStatus, // Sekarang adalah String
      tanggal: new Date(tanggalPemeriksaan),
      kaderEmail: email,
      konjungtivitaNormal: konjungtivitaNormal,
      kukuBersih: kukuBersih,
      tampakLemas: tampakLemas,
      tampakPucat: tampakPucat,
      riwayatAnemia: riwayatAnemia,
    };

    // Create AnakKader record
    const anakKaderRecord = await prisma.anakKader.create({
      data: anakKaderData,
    });

    res.status(201).json({
      message: "Anak uploaded successfully and RecapRt created/updated",
      anakKader: anakKaderRecord,
    });
  } catch (error) {
    console.error("Error uploading anak:", error);
    // Tambahkan kondisi untuk menangani error yang dilempar dari catch block internal
    if (error.message.includes("Failed to get")) {
         return; // sudah dikirim di catch internal, atau tambahkan res.status(500) di sana
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const editAnak = async (req, res) => {
  try {
    const {
      email, 
      tanggalPemeriksaan,
      namaIbu,
      namaAnak,
      umurTahun,
      umurBulan,
      beratBadan,
      tinggiBadan, 
      jenisKelamin,
      konjungtivitaNormal: konjungtivitaNormal,
      kukuBersih: kukuBersih,
      tampakLemas: tampakLemas,
      tampakPucat: tampakPucat,
      riwayatAnemia: riwayatAnemia,
      id,

    } = req.body;

    console.log(konjungtivitaNormal, kukuBersih, tampakLemas, tampakPucat, riwayatAnemia);

    const usiaInMonths = (parseInt(umurTahun) * 12) + parseInt(umurBulan);
    
    // Validasi Usia Balita (Maksimal 60 bulan / 5 tahun)
    if (usiaInMonths > 60) {
      return res.status(400).json({ message: "Usia anak tidak boleh lebih dari 60 bulan (5 tahun) untuk pemeriksaan Stunting." });
    }
    //Panggil API Python dengan parameter konjungtivitaNormal, kukuBersih, tampakLemas, tampakPucat, riwayatAnemia
    //Return stunting dan anemia

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
          tampakPucat: tampakPucat,
        }),
      });

      if (!anemiaResponse.ok) {
        throw new Error(`HTTP error! status: ${anemiaResponse.status}`);
      }

      const anemiaResult = await anemiaResponse.json();
      isAnemic = anemiaResult.anemia; // Mengambil nilai boolean dari respons
      console.log("Anemia Result from API:", isAnemic);
    } catch (error) {
      console.error("Error calling anemia API:", error);
      // Lempar error untuk menghentikan proses unggah jika API gagal
      throw new Error("Failed to get anemia status from API.");
    }

    // Panggil API untuk memeriksa stunting
    let stuntingStatus;
    try {
      // Mengubah jenis kelamin menjadi 'l' atau 'p' sebelum dikirim ke API
      let kelaminUntukAPI;
      if (jenisKelamin.toLowerCase() === 'laki-laki') {
        kelaminUntukAPI = 'l';
      } else if (jenisKelamin.toLowerCase() === 'perempuan') {
        kelaminUntukAPI = 'p';
      } else {
        // Fallback jika input tidak sesuai
        console.warn("Invalid 'jenisKelamin' value. Defaulting to 'l'.");
        kelaminUntukAPI = 'l';
      }

      const stuntingResponse = await fetch(`${process.env.ML_API_URL}/stunting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Mengubah key agar sesuai dengan model FastAPI
          usiaBulan: usiaInMonths,
          tinggi: parseFloat(tinggiBadan),
          kelamin: kelaminUntukAPI, // Menggunakan nilai yang sudah diubah
        }),
      });

      if (!stuntingResponse.ok) {
        // Log pesan error dari server Python jika tersedia
        const errorText = await stuntingResponse.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${stuntingResponse.status}`);
      }

      const stuntingResult = await stuntingResponse.json();
      stuntingStatus = stuntingResult; // Mengambil nilai string dari respons
    } catch (error) {
      console.error("Error calling stunting API:", error);
      // Lempar error untuk menghentikan proses unggah jika API gagal
      throw new Error("Failed to get stunting status from API.");
    }

    console.log(isAnemic);
    console.log(stuntingStatus);

    if(stuntingStatus == "Sangat Pendek"){
      stuntingStatus = "SangatPendek";
    }

    const anakKaderData = {
      nama: namaAnak,
      jenisKelamin: jenisKelamin, // Assuming 'L' for
      namaIbu: namaIbu,
      usia: usiaInMonths, // Age in total months
      beratBadan: parseFloat(beratBadan),
      tinggiBadan: parseFloat(tinggiBadan), // Using tinggiBadan from req.body
      anemia: isAnemic, // Temporarily set to true as requested
      stunting: stuntingStatus, // Temporarily set to true as requested
      tanggal: new Date(tanggalPemeriksaan), // Ensure it's a Date object
      id: id,

      konjungtivitaNormal: konjungtivitaNormal,
      kukuBersih: kukuBersih,
      tampakLemas: tampakLemas,
      tampakPucat: tampakPucat,
      riwayatAnemia: riwayatAnemia,
    };

    // Create AnakKader record
    const anakKaderRecord = await prisma.anakKader.update({
      where: { id: id }, // Use the provided ID to update the record
      data: anakKaderData,
    });


    res.status(201).json({
      message: "Anak uploaded successfully and RecapRt created/updated",
      anakKader: anakKaderRecord,
    });
  } catch (error) {
    console.error("Error uploading anak:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAnak = async (req, res) => {
  try {
    const { id } = req.params; // Ambil ID dari URL parameter

    // 1. Validasi: Pastikan ID tidak kosong
    if (!id) {
      return res.status(400).json({ error: "ID is required." });
    }

    // 2. Gunakan prisma.anakKader.delete()
    const anakKaderRecord = await prisma.anakKader.delete({
      where: {
        id: id,
      },
    });

    // 3. Kirim respons sukses
    res.status(200).json({
      message: "Data anak berhasil dihapus!",
      deletedAnak: anakKaderRecord,
    });
  } catch (error) {
    // 4. Tangani error, misalnya data tidak ditemukan
    if (error.code === 'P2025') {
      return res.status(404).json({ error: "Data anak tidak ditemukan." });
    }
    console.error("Error deleting anak:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getAnakKaderByMonth = async (req, res) => {
  try {
    const { email, month, count, year } = req.body;

    if (!email || !month || !count || !year) {
      return res.status(400).json({ error: "Email, month, count, and year are required." });
    }

    // Mengubah filter agar melihat ke belakang (backward) bukan ke depan (forward)
    const startDate = new Date(year, month - count, 1);
    const endDate = new Date(year, month, 0);

    const anakKader = await prisma.anakKader.findMany({
      where: {
        kaderEmail: email,
        tanggal: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        tanggal: 'asc',
      },
    });

    if (!anakKader || anakKader.length === 0) {
      return res.status(404).json({ message: "No data found for the specified period." });
    }

    res.status(200).json(anakKader);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
    
    
module.exports = {
    getKader,
    editKader,
    unggahAnak,
    getRecap,
    getRecapById,
    editAnak,
    deleteAnak,
    getAnakKaderByMonth,
};