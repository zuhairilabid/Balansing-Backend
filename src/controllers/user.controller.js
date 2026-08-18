// controllers/user.controller.js

const ClientError = require("../errors/ClientError");
const { createClient } = require('@supabase/supabase-js');
// const bcrypt = require('bcryptjs'); // Tidak perlu lagi jika Supabase yang menghash
const crypto = require('crypto');
const passport = require('../passport'); // Jika Anda menggunakan passport
const jwt = require('jsonwebtoken');

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

const prisma = require('../db');

const generateRandomId = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

const registerKader = async (req, res) => {
  const {
    email,
    noTelp,
    password,
    namaPuskesmas,
    namaPosyandu,
    provinsi,
    kota,
    kecamatan,
    kelurahan,
    rt,
    rw,
    kodePos,
    posyanduId,
  } = req.body;

  // Validasi input dasar
  const missingFields = [];
  if (!email && !noTelp) missingFields.push('Email atau No Telp');
  if (!password) missingFields.push('Password');
  if (!provinsi) missingFields.push('Provinsi');
  if (!kota) missingFields.push('Kota');
  if (!kecamatan) missingFields.push('Kecamatan');
  if (!kelurahan) missingFields.push('Kelurahan');
  if (!rt) missingFields.push('RT');
  if (!rw) missingFields.push('RW');

  if (missingFields.length > 0) {
    return res.status(400).json({ message: `Mohon lengkapi data berikut: ${missingFields.join(', ')}.` });
  }

  // Jika posyanduId diberikan, tarik data Puskesmas dan Posyandu dari DB
  let finalNamaPuskesmas = namaPuskesmas;
  let finalNamaPosyandu = namaPosyandu;

  try {
    if (posyanduId) {
      const posyanduData = await prisma.posyandu.findUnique({
        where: { id: posyanduId },
        include: { puskesmas: true }
      });
      if (posyanduData) {
        finalNamaPosyandu = posyanduData.namaPosyandu;
        finalNamaPuskesmas = posyanduData.puskesmas.namaPuskesmas;
      }
    }
  } catch (err) {
    console.error("Error fetching posyandu:", err);
  }

  try {
    // --- 0. PRE-CHECK DUPLIKASI (Email & NoTelp) DI PRISMA ---
    const existingKaderEmail = email ? await prisma.kader.findFirst({ where: { email } }) : null;
    const existingIbuEmail = email ? await prisma.ibuRumah.findFirst({ where: { email } }) : null;

    const existingKaderPhone = noTelp ? await prisma.kader.findFirst({ where: { noTelp } }) : null;
    const existingIbuPhone = noTelp ? await prisma.ibuRumah.findFirst({ where: { noTelp } }) : null;

    const emailExists = !!(existingKaderEmail || existingIbuEmail);
    const phoneExists = !!(existingKaderPhone || existingIbuPhone);

    if (emailExists && phoneExists) {
      return res.status(409).json({ message: 'Email dan Nomor Telepon sudah terdaftar. Silakan gunakan yang lain.' });
    } else if (emailExists) {
      return res.status(409).json({ message: 'Email sudah terdaftar. Silakan gunakan email lain.' });
    } else if (phoneExists) {
      return res.status(409).json({ message: 'Nomor Telepon sudah terdaftar. Silakan gunakan nomor lain.' });
    }

    let supabaseUser, supabaseError;

    // 1. Membuat user di autentikasi Supabase menggunakan Admin API (Mencegah token invalidation dan mempermudah bypass rate limit)
    const supabasePayload = {
      password: password,
      phone_confirm: true,
      email_confirm: false, // Set false agar mereka tetap harus verifikasi jika ada email
    };
    if (email) supabasePayload.email = email;
    if (noTelp) supabasePayload.phone = noTelp;

    const result = await supabaseAdmin.auth.admin.createUser(supabasePayload);
    supabaseUser = result.data;
    supabaseError = result.error;

    // Jika berhasil buat user dengan email, generate link manual untuk testing (Bypass Rate Limit)
    if (!supabaseError && email && supabaseUser?.user) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:6500';
        const redirectToUrl = `${backendUrl}/api/user/verify-callback`;

        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'signup',
          email: email,
          password: password,
          options: {
            redirectTo: redirectToUrl,
          }
        });
        
        if (linkData?.properties?.action_link) {
          console.log("\n=======================================================");
          console.log("🛠️ BYPASS RATE LIMIT EMAIL VERIFICATION");
          console.log("Klik link di bawah ini untuk memverifikasi email kader:");
          console.log(linkData.properties.action_link);
          console.log("=======================================================\n");
        }

        // Coba kirim email aslinya (jika tidak kena rate limit)
        await supabase.auth.resend({ 
          type: 'signup', 
          email: email,
          options: {
            emailRedirectTo: redirectToUrl,
          }
        });
      } catch (err) {
        console.log("Pesan email tidak terkirim karena rate limit, tapi user bisa menggunakan link di atas.");
      }
    }

    if (supabaseError) {
      console.error("Supabase registration error:", supabaseError.message);
      if (supabaseError.message.toLowerCase().includes("email address has already been registered")) {
        return res.status(409).json({ message: 'Email sudah terdaftar. Silakan gunakan email lain.' });
      }
      if (supabaseError.message.toLowerCase().includes("phone number already registered")) {
         return res.status(409).json({ message: 'Nomor Telepon sudah terdaftar. Silakan gunakan nomor lain.' });
      }
      if (supabaseError.message.toLowerCase().includes("already been registered") || supabaseError.message.toLowerCase().includes("already registered")) {
        return res.status(409).json({ message: 'Email atau Nomor Telepon sudah terdaftar. Silakan gunakan yang lain.' });
      }
      if (supabaseError.message.includes("phone format")) {
         return res.status(400).json({ message: 'Format Nomor Telepon tidak valid. Pastikan menggunakan kode negara (contoh: +62812...).' });
      }
      return res.status(500).json({ message: `Gagal mendaftar akun: ${supabaseError.message}`, error: supabaseError.message });
    }

    // Pastikan user Supabase berhasil dibuat dan memiliki ID
    if (!supabaseUser || !supabaseUser.user || !supabaseUser.user.id) {
      // Ini seharusnya tidak terjadi jika tidak ada supabaseError, tapi sebagai fallback
      return res.status(500).json({ message: 'Gagal mendapatkan ID user dari Supabase Auth.' });
    }

    // 2. Data Prisma User lama Dihapus (Step 2 dihapus)
    const fallbackEmail = email || null; // Sekarang kita bisa pakai null jika tidak ada email!

    // 3. Membuat data baru di Kader
    let newKader;
    try {
      newKader = await prisma.kader.create({
        data: {
          id: generateRandomId(),
          email: fallbackEmail,
          authId: supabaseUser.user.id, // DUAL WRITE FASE 2
          noTelp: noTelp || null,
          posyanduId: posyanduId || null,
          namaPuskesmas: finalNamaPuskesmas || '-',
          namaPosyandu: finalNamaPosyandu || '-',
          provinsi: provinsi,
          kota: kota,
          kecamatan: kecamatan,
          kelurahan: kelurahan,
          rt: rt,
          rw: rw,
          kodePos: kodePos || null,
        },
      });
    } catch (prismaKaderError) {
      console.error("Prisma Kader creation error:", prismaKaderError);
      // PERBAIKAN: Jika pembuatan kader gagal, hapus user dari Supabase
      if (supabaseUser && supabaseUser.user && supabaseUser.user.id) {
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      }
      return res.status(500).json({ message: 'Gagal membuat data kader di database.', error: prismaKaderError.message });
    }

    res.status(201).json({
      message: 'Registrasi berhasil! Silakan cek email Anda untuk verifikasi.',
      user: {
        id: newKader.authId,
        email: newKader.email,
        jenis: 'KADER',
      },
      kader: newKader,
    });

  } catch (error) {
    console.error("General registration error:", error);
    res.status(500).json({ message: 'Terjadi kesalahan server.', error: error.message });
  }
};

// --- Perubahan pada fungsi login ---
// Jika Anda menggunakan Passport.js, Anda perlu mengkonfigurasi strategi 'local'
// untuk berinteraksi dengan Supabase Auth, BUKAN tabel User Anda sendiri.
const login = async (req, res, next) => {
  const { email, noTelp, password } = req.body;

  if ((!email && !noTelp) || !password) {
    return res.status(400).json({ message: 'Email/No Telp dan password harus diisi.' });
  }

  try {
    // 1. Cek eksistensi di database lokal terlebih dahulu
    // Ini bertujuan agar kita bisa memberikan pesan error yang spesifik (Email tidak terdaftar)
    // Karena Supabase secara default akan mengembalikan 'Invalid login credentials' untuk email yang tidak ada.
    let userExists = null;
    if (email) {
      userExists = await prisma.kader.findFirst({ where: { email } }) || await prisma.ibuRumah.findFirst({ where: { email } });
    } else if (noTelp) {
      userExists = await prisma.kader.findFirst({ where: { noTelp } }) || await prisma.ibuRumah.findFirst({ where: { noTelp } });
    }

    if (!userExists) {
      return res.status(404).json({ message: email ? 'Email tidak terdaftar.' : 'Nomor telepon tidak terdaftar.' });
    }

    // 2. Jika akun ada di database, lanjutkan login ke Supabase
    let signInPayload = { password };
    if (email) {
      signInPayload.email = email;
    } else if (noTelp) {
      signInPayload.phone = noTelp;
    }

    // Gunakan supabase.auth.signInWithPassword untuk login
    const { data, error } = await supabase.auth.signInWithPassword(signInPayload);

    if (error) {
      console.error("Supabase login error:", error.message);
      
      if (error.message.toLowerCase().includes('email not confirmed')) {
        return res.status(403).json({ message: 'Email belum diverifikasi. Silakan periksa kotak masuk email Anda.' });
      }

      // Karena kita sudah memfilter "Email tidak terdaftar" di atas, 
      // Jika sampai sini terjadi error "Invalid login credentials", maka dipastikan itu adalah salah password.
      return res.status(401).json({ message: 'Password salah. Silakan coba lagi.' });
    }

    const supabaseUser = data.user;
    const session = data.session;

    if (!supabaseUser || !session) {
      return res.status(401).json({ message: 'Login gagal. Sesi tidak ditemukan.' });
    }

    // Ambil data user dari tabel Prisma (Mencari berdasarkan ID dari Supabase)
    let userProfile = await prisma.kader.findFirst({
      where: { authId: supabaseUser.id },
    });
    let jenisUser = 'KADER';

    if (!userProfile) {
      userProfile = await prisma.ibuRumah.findFirst({
        where: { authId: supabaseUser.id },
      });
      jenisUser = 'IBU';
    }

    if (!userProfile) {
      console.warn(`User with ID ${supabaseUser.id} found in Supabase Auth but not in Prisma User table.`);
      return res.status(404).json({ message: 'Data user tidak ditemukan di database aplikasi.' });
    }

    const secretKey = process.env.JWT_SECRET || 'your_jwt_secret_key';

    const token = jwt.sign(
      {
        supabaseId: supabaseUser.id,
        email: userProfile.email, // bisa null
        jenis: jenisUser,
      },
      secretKey,
      { expiresIn: '1000h' }
    );

    res.status(200).json({
      message: 'Login berhasil!',
      token: token,
      user: {
        id: userProfile.id,
        email: userProfile.email,
        jenis: jenisUser,
      },
    });

  } catch (err) {
    console.error("General login error:", err);
    res.status(500).json({ message: 'Terjadi kesalahan server.', error: err.message });
  }
};

const logout = async (req, res) => {
  // Jika Anda menggunakan Supabase Auth untuk sesi, Anda juga perlu logout dari Supabase
  try {
    const { error } = await supabase.auth.signOut(); // Logout dari sesi Supabase
    if (error) {
      console.error("Supabase logout error:", error.message);
      return res.status(500).json({ message: 'Gagal logout dari Supabase.', error: error.message });
    }
    res.status(200).json({ message: 'Logout berhasil. Mohon hapus token dari perangkat Anda.' });
  } catch (err) {
    console.error("General logout error:", err);
    res.status(500).json({ error: err.message });
  }
};


const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email harus diisi.' });
  }

  try {
    // Menggunakan variabel environment atau fallback ke localhost untuk testing lokal
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:6500';
    const redirectToUrl = `${backendUrl}/api/user/handleresetpassword`;

    // Gunakan supabaseAdmin untuk mengirim email reset password
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: redirectToUrl,
    });

    if (error) {
      console.error('Error requesting password reset:', error);
      return res.status(500).json({ error: 'Terjadi kesalahan saat meminta reset password.' });
    }

    res.status(200).json({ message: 'Jika email Anda terdaftar, tautan reset password telah dikirim ke email Anda.' });

  } catch (err) {
    console.error('Error in password reset request:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
};


const handleResetPasswordPage = async (req, res) => {
  // console.log("URL Query Parameters:", req.query); // Anda bisa hapus ini setelah konfirmasi
  // const { access_token, type } = req.query; // <--- BARIS INI TIDAK AKAN BEKERJA UNTUK HASH FRAGMENT

  // Kita tidak akan mendapatkan access_token dari req.query di backend karena itu ada di hash fragment.
  // Kita akan membacanya di JavaScript client-side di dalam HTML.

  // Selalu render form, dan biarkan JavaScript di client-side yang membaca dan memvalidasi token.
  // Jika token tidak ada/tidak valid, JavaScript akan menampilkan pesan error.

  res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ubah Password Anda</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .container { background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); width: 100%; max-width: 400px; text-align: center; }
                h2 { color: #333; margin-bottom: 20px; }
                .form-group { margin-bottom: 15px; text-align: left; }
                label { display: block; margin-bottom: 5px; color: #555; }
                input[type="password"] { width: calc(100% - 20px); padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
                button { background-color: #9FC86A; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
                button:hover { background-color:rgb(173, 199, 140); }
                .message { margin-top: 20px; padding: 10px; border-radius: 4px; font-weight: bold; }
                .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Buat Password Baru</h2>
                <div id="message" class="message" style="display:none;"></div>
                <form id="resetPasswordForm">
                    <div class="form-group">
                        <label for="new_password">Password Baru:</label>
                        <input type="password" id="new_password" name="newPassword" required minlength="6">
                    </div>
                    <div class="form-group">
                        <label for="confirm_password">Konfirmasi Password Baru:</label>
                        <input type="password" id="confirm_password" name="confirmPassword" required>
                    </div>
                    <input type="hidden" id="access_token" name="accessToken" value=""> 
                    <button type="submit">Ubah Password</button>
                </form>
            </div>

           <script>
            const form = document.getElementById('resetPasswordForm');
            const messageDiv = document.getElementById('message');

            // --- DAPATKAN access_token dan refresh_token dari hash fragment URL ---
            const urlHash = window.location.hash;
            let access_token = null;
            let refresh_token = null;

            if (urlHash) {
                const params = new URLSearchParams(urlHash.substring(1)); // Hapus tanda '#'
                access_token = params.get('access_token');
                refresh_token = params.get('refresh_token');
            }

            if (!access_token || !refresh_token) {
                showMessage('Tautan reset password tidak valid atau kadaluarsa. Silakan minta tautan baru.', 'error');
                form.style.display = 'none';
            }

            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const newPassword = document.getElementById('new_password').value;
                const confirmPassword = document.getElementById('confirm_password').value;

                if (newPassword !== confirmPassword) {
                    showMessage('Password baru dan konfirmasi tidak cocok.', 'error');
                    return;
                }

                if (newPassword.length < 6) {
                    showMessage('Password minimal 6 karakter.', 'error');
                    return;
                }

                try {
                    const response = await fetch('/api/user/handleresetpassword', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            access_token,
                            refresh_token,
                            newPassword,
                        }),
                    });

                    const data = await response.json();

                    if (response.ok) {
                        showMessage(data.message || 'Password berhasil diubah. Silakan login.', 'success');
                        form.reset();
                    } else {
                        showMessage(data.error || 'Gagal mengubah password.', 'error');
                    }
                } catch (error) {
                    console.error('Error submitting form:', error);
                    showMessage('Terjadi kesalahan saat menghubungi server.', 'error');
                }
            });

            function showMessage(msg, type) {
                messageDiv.textContent = msg;
                messageDiv.className = 'message ' + type;
                messageDiv.style.display = 'block';
            }
        </script>
        </body>
        </html>
    `);
};

// Fungsi untuk memperbarui password dari form HTML
const updatePasswordFromForm = async (req, res) => {
  const { access_token, refresh_token, newPassword } = req.body;

  console.log(access_token)
  console.log(refresh_token)
  console.log(newPassword)

  if (!access_token || !refresh_token || !newPassword) {
    return res.status(400).json({ error: 'Token dan password baru harus diisi.' });
  }

  try {
    // Set session dulu pakai token dari URL reset password
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError) {
      return res.status(400).json({ error: 'Token tidak valid atau sudah kadaluarsa.' });
    }

    // Update password
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ message: 'Password berhasil diperbarui.' });
  } catch (err) {
    console.error('Error in updatePasswordFromForm:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
};

const changePassword = async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  if (!email || !oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Email, password lama, dan password baru harus diisi.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password baru minimal 6 karakter.' });
  }

  try {
    // 1. Authenticate the user with their old email and password using Supabase
    // This implicitly verifies the old password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: oldPassword,
    });

    if (signInError) {
      console.error("Supabase sign-in error during password change:", signInError.message);
      // Return a generic "invalid credentials" message for security reasons
      return res.status(401).json({ success: false, message: 'Email atau password lama salah.' });
    }

    // Ensure user and session are obtained from the sign-in
    if (!signInData || !signInData.user || !signInData.session) {
      return res.status(401).json({ success: false, message: 'Autentikasi gagal.' });
    }

    // 2. If authentication is successful, update the user's password using the session
    // Supabase automatically handles hashing the new password
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("Supabase update password error:", updateError.message);
      return res.status(500).json({ success: false, message: 'Gagal memperbarui password di Supabase.', error: updateError.message });
    }

    // Optional: Re-authenticate to get a fresh session if needed, though update user usually refreshes it
    // Or simply confirm the password has been changed
    res.status(200).json({ success: true, message: 'Password berhasil diubah.' });

  } catch (error) {
    console.error("General error during password change:", error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server.', error: error.message });
  }
};

const registerIbu = async (req, res) => {
  const {
    email,
    password,
    namaIbu,
    provinsi,
    kota,
    kecamatan,
    kelurahan,
    rt,
    rw,
    usia,
    noTelp,
    kodePos,
    alamat,
    posyanduId,
  } = req.body;

  // Validasi input dasar
  const missingFields = [];
  if (!email && !noTelp) missingFields.push('Email atau No Telp');
  if (!password) missingFields.push('Password');
  if (!namaIbu) missingFields.push('Nama Ibu');
  if (!provinsi) missingFields.push('Provinsi');
  if (!kota) missingFields.push('Kota');
  if (!kecamatan) missingFields.push('Kecamatan');
  if (!kelurahan) missingFields.push('Kelurahan');
  if (!rt) missingFields.push('RT');
  if (!rw) missingFields.push('RW');

  if (missingFields.length > 0) {
    return res.status(400).json({ message: `Mohon lengkapi data berikut: ${missingFields.join(', ')}.` });
  }

  try {
    // --- 0. PRE-CHECK DUPLIKASI (Email & NoTelp) DI PRISMA ---
    const existingKaderEmail = email ? await prisma.kader.findFirst({ where: { email } }) : null;
    const existingIbuEmail = email ? await prisma.ibuRumah.findFirst({ where: { email } }) : null;

    const existingKaderPhone = noTelp ? await prisma.kader.findFirst({ where: { noTelp } }) : null;
    const existingIbuPhone = noTelp ? await prisma.ibuRumah.findFirst({ where: { noTelp } }) : null;

    const emailExists = !!(existingKaderEmail || existingIbuEmail);
    const phoneExists = !!(existingKaderPhone || existingIbuPhone);

    if (emailExists && phoneExists) {
      return res.status(409).json({ message: 'Email dan Nomor Telepon sudah terdaftar. Silakan gunakan yang lain.' });
    } else if (emailExists) {
      return res.status(409).json({ message: 'Email sudah terdaftar. Silakan gunakan email lain.' });
    } else if (phoneExists) {
      return res.status(409).json({ message: 'Nomor Telepon sudah terdaftar. Silakan gunakan nomor lain.' });
    }

    let supabaseUser, supabaseError;

    // 1. Membuat user di autentikasi Supabase menggunakan Admin API (Mencegah token invalidation dan mempermudah bypass rate limit)
    const supabasePayload = {
      password: password,
      phone_confirm: true,
      email_confirm: false, // Set false agar mereka tetap harus verifikasi jika ada email
    };
    if (email) supabasePayload.email = email;
    if (noTelp) supabasePayload.phone = noTelp;

    const result = await supabaseAdmin.auth.admin.createUser(supabasePayload);
    supabaseUser = result.data;
    supabaseError = result.error;

    // Jika berhasil buat user dengan email, generate link manual untuk testing (Bypass Rate Limit)
    if (!supabaseError && email && supabaseUser?.user) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:6500';
        const redirectToUrl = `${backendUrl}/api/user/verify-callback`;

        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'signup',
          email: email,
          password: password,
          options: {
            redirectTo: redirectToUrl,
          }
        });
        
        if (linkData?.properties?.action_link) {
          console.log("\n=======================================================");
          console.log("🛠️ BYPASS RATE LIMIT EMAIL VERIFICATION");
          console.log("Klik link di bawah ini untuk memverifikasi email ibu:");
          console.log(linkData.properties.action_link);
          console.log("=======================================================\n");
        }

        // Coba kirim email aslinya (jika tidak kena rate limit)
        await supabase.auth.resend({ 
          type: 'signup', 
          email: email,
          options: {
            emailRedirectTo: redirectToUrl,
          }
        });
      } catch (err) {
        console.log("Pesan email tidak terkirim karena rate limit, tapi user bisa menggunakan link di atas.");
      }
    }

    if (supabaseError) {
      console.error("Supabase registration error:", supabaseError.message);
      if (supabaseError.message.toLowerCase().includes("email address has already been registered")) {
        return res.status(409).json({ message: 'Email sudah terdaftar. Silakan gunakan email lain.' });
      }
      if (supabaseError.message.toLowerCase().includes("phone number already registered")) {
         return res.status(409).json({ message: 'Nomor Telepon sudah terdaftar. Silakan gunakan nomor lain.' });
      }
      if (supabaseError.message.toLowerCase().includes("already been registered") || supabaseError.message.toLowerCase().includes("already registered")) {
        return res.status(409).json({ message: 'Email atau Nomor Telepon sudah terdaftar. Silakan gunakan yang lain.' });
      }
      if (supabaseError.message.includes("phone format")) {
         return res.status(400).json({ message: 'Format Nomor Telepon tidak valid. Pastikan menggunakan kode negara (contoh: +62812...).' });
      }
      return res.status(500).json({ message: `Gagal mendaftar akun: ${supabaseError.message}`, error: supabaseError.message });
    }

    // Pastikan user Supabase berhasil dibuat dan memiliki ID
    if (!supabaseUser || !supabaseUser.user || !supabaseUser.user.id) {
      // Ini seharusnya tidak terjadi jika tidak ada supabaseError, tapi sebagai fallback
      return res.status(500).json({ message: 'Gagal mendapatkan ID user dari Supabase Auth.' });
    }

    // 2. Data Prisma User lama dihapus (Step 2)
    const fallbackEmail = email || null;

    // 3. Membuat data baru di IbuRumah
    let newIbu;
    try {
      newIbu = await prisma.ibuRumah.create({
        data: {
          id: generateRandomId(),
          email: fallbackEmail,
          authId: supabaseUser.user.id, // DUAL WRITE FASE 2
          nama: namaIbu,
          provinsi: provinsi,
          kota: kota,
          kecamatan: kecamatan,
          kelurahan: kelurahan,
          rt: rt,
          rw: rw,
          kodePos: kodePos || null,
          usia: usia,
          noTelp: noTelp,
          alamat: alamat,
          posyanduId: posyanduId || null,
        },
      });
    } catch (prismaKaderError) {
      console.error("Prisma Kader creation error:", prismaKaderError);
      // Jika pembuatan Ibu di Prisma gagal, hapus user dari Supabase
      if (supabaseUser && supabaseUser.user && supabaseUser.user.id) {
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      }
      return res.status(500).json({ message: 'Gagal membuat data kader di database.', error: prismaKaderError.message });
    }

    res.status(201).json({
      message: 'Registrasi berhasil! Silakan cek email Anda untuk verifikasi.',
      user: {
        id: newIbu.authId,
        email: newIbu.email,
        jenis: 'IBU',
      },
      ibu: newIbu,
    });

  } catch (error) {
    console.error("General registration error:", error);
    res.status(500).json({ message: 'Terjadi kesalahan server.', error: error.message });
  }
};

const cleanupUnconfirmedUsers = async () => {
  console.log('[CLEANUP] Memulai pembersihan akun yang belum diverifikasi...');
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      console.error('[CLEANUP] Error fetching users dari Supabase:', error);
      return;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    // Filter users: belum konfirmasi email & dibuat lebih dari 7 hari yang lalu
    const unconfirmedOldUsers = users.filter(user =>
      !user.email_confirmed_at && new Date(user.created_at) < sevenDaysAgo
    );

    if (unconfirmedOldUsers.length === 0) {
      console.log('[CLEANUP] Tidak ada akun sampah yang perlu dihapus.');
      return;
    }

    let deletedCount = 0;
    for (const user of unconfirmedOldUsers) {
      const email = user.email;

      try {
        // Cek di Kader
        const kaderProfile = await prisma.kader.findFirst({ where: { authId: user.id } });
        if (kaderProfile) {
          await prisma.kader.deleteMany({ where: { authId: user.id } });
        } else {
          // Cek di IbuRumah
          const ibuProfile = await prisma.ibuRumah.findFirst({ where: { authId: user.id } });
          if (ibuProfile) {
            await prisma.ibuRumah.deleteMany({ where: { authId: user.id } });
          }
        }

        // Hapus dari Supabase Auth
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        deletedCount++;
        console.log(`[CLEANUP] Berhasil menghapus akun sampah: ${email}`);
      } catch (err) {
        console.error(`[CLEANUP] Gagal menghapus akun ${email}:`, err);
      }
    }

    console.log(`[CLEANUP] Selesai. Total ${deletedCount} akun sampah dihapus.`);
  } catch (error) {
    console.error('[CLEANUP] Fatal error during cleanup:', error);
  }
};

const verifyEmailCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2>Link verifikasi tidak valid atau tidak lengkap.</h2>
          <p>Parameter 'code' tidak ditemukan.</p>
        </body>
      </html>
    `);
  }

  try {
    // Tukar kode PKCE untuk session yang otomatis memverifikasi email
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("Error exchanging code:", error.message);
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h2 style="color: red;">Verifikasi Gagal</h2>
            <p>${error.message}</p>
          </body>
        </html>
      `);
    }

    // Jika berhasil, tampilkan halaman sukses
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f4;">
          <div style="background-color: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h1 style="color: #4CAF50;">✅ Verifikasi Berhasil!</h1>
            <p style="font-size: 16px; color: #333;">Email Anda telah sukses diverifikasi.</p>
            <p style="font-size: 16px; color: #666;">Anda sekarang dapat kembali ke aplikasi Balansing dan melakukan login.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("General error verify callback:", err);
    res.status(500).send("Terjadi kesalahan internal server.");
  }
};

module.exports = {
  changePassword,
  login,
  registerKader,
  logout,
  requestPasswordReset,
  handleResetPasswordPage,
  updatePasswordFromForm,
  registerIbu,
  cleanupUnconfirmedUsers,
  verifyEmailCallback,
};