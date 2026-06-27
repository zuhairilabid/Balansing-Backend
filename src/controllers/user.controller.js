// controllers/user.controller.js

const { PrismaClient } = require("@prisma/client");
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

const prisma = new PrismaClient();

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
  } = req.body;

  // Validasi input dasar
  if (!email || !password || !namaPuskesmas || !namaPosyandu || !provinsi || !kota || !kecamatan || !kelurahan || !rt || !rw) {
    return res.status(400).json({ message: 'Semua field wajib diisi kecuali kodePos.' });
  }

  try {
    // 1. Membuat user di autentikasi Supabase
    // Supabase akan menghash password ini secara otomatis di auth.users
    const { data: supabaseUser, error: supabaseError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (supabaseError) {
      console.error("Supabase registration error:", supabaseError.message);
      if (supabaseError.message.includes("User already registered")) {
        return res.status(409).json({ message: 'Email sudah terdaftar.' }); // Pesan lebih umum
      }
      return res.status(500).json({ message: 'Gagal mendaftar user di Supabase Auth.', error: supabaseError.message });
    }

    // Pastikan user Supabase berhasil dibuat dan memiliki ID
    if (!supabaseUser || !supabaseUser.user || !supabaseUser.user.id) {
        // Ini seharusnya tidak terjadi jika tidak ada supabaseError, tapi sebagai fallback
        return res.status(500).json({ message: 'Gagal mendapatkan ID user dari Supabase Auth.' });
    }

    // 2. Membuat data User baru ke database Prisma
    // PENTING: JANGAN SIMPAN PASSWORD DI SINI. Gunakan ID dari Supabase Auth.
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          id: supabaseUser.user.id, // Gunakan ID dari Supabase Auth sebagai primary key atau foreign key
          email: email,
          jenis: 'KADER', // Set jenis user sebagai 'KADER'
        },
      });
    } catch (prismaUserError) {
      console.error("Prisma User creation error:", prismaUserError);
      // Jika pembuatan User di Prisma gagal, hapus user dari Supabase Auth
      await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      return res.status(500).json({ message: 'Gagal membuat data user di database (Prisma).', error: prismaUserError.message });
    }

    // 3. Membuat data baru di Kader
    let newKader;
    try {
      newKader = await prisma.kader.create({
        data: {
          id: generateRandomId(), // Menggunakan fungsi generateRandomId untuk ID unik Kader
          email: email, // Email ini bisa disimpan sebagai referensi, tapi userId lebih baik
          namaPuskesmas: namaPuskesmas,
          namaPosyandu: namaPosyandu,
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
      // Jika pembuatan Kader di Prisma gagal, hapus user dari Supabase Auth dan Prisma User
      if (supabaseUser && supabaseUser.user && supabaseUser.user.id) {
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      }
      // PERBAIKAN: Gunakan email untuk menghapus user dari tabel Prisma
      await prisma.user.delete({ where: { email: email } }); // <--- PERBAIKAN DI SINI
      return res.status(500).json({ message: 'Gagal membuat data kader di database.', error: prismaKaderError.message });
    }

    res.status(201).json({
      message: 'Registrasi kader berhasil! Silakan cek email Anda untuk verifikasi (jika diaktifkan).',
      user: {
        id: newUser.id,
        email: newUser.email,
        jenis: newUser.jenis,
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
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi.' });
  }

  try {
    // Gunakan supabase.auth.signInWithPassword untuk login
    const { data, error } = await supabase.auth.signInWithPassword({ // Gunakan supabase client biasa (ANON_KEY)
      email: email,
      password: password,
    });

    if (error) {
      console.error("Supabase login error:", error.message);
      // Pesan error Supabase biasanya sudah cukup jelas untuk login gagal
      return res.status(401).json({ message: error.message || 'Login gagal. Email atau password salah.' });
    }

    // Jika login Supabase berhasil, Anda mendapatkan sesi dan user dari Supabase
    const supabaseUser = data.user;
    const session = data.session;

    if (!supabaseUser || !session) {
        return res.status(401).json({ message: 'Login gagal. Sesi tidak ditemukan.' });
    }

    // Ambil data user dari tabel Prisma Anda menggunakan ID dari Supabase Auth
    const userProfile = await prisma.User.findUnique({
        where: { email: email }, 
    });

    if (!userProfile) {
        // Ini menandakan ada inkonsistensi: user ada di Supabase Auth tapi tidak di DB Anda
        console.warn(`User with ID ${supabaseUser.id} found in Supabase Auth but not in Prisma User table.`);
        // Anda mungkin ingin menghapus user ini dari Supabase Auth atau memicu proses sinkronisasi
        return res.status(404).json({ message: 'Data user tidak ditemukan di database aplikasi.' });
    }

    const secretKey = process.env.JWT_SECRET || 'your_jwt_secret_key';

    // Membuat JWT menggunakan data dari sesi Supabase atau profil user Prisma
    const token = jwt.sign(
      {
        supabaseId: supabaseUser.id, // ID dari Supabase Auth
        email: userProfile.email,
        jenis: userProfile.jenis,
        // Anda bisa menambahkan data lain dari userProfile atau supabaseUser
      },
      secretKey,
      { expiresIn: '1000h' } // Sangat disarankan untuk menggunakan waktu kedaluwarsa pada JWT
    );

    res.status(200).json({
      message: 'Login berhasil!',
      token: token,
      user: {
        id: userProfile.id,
        email: userProfile.email,
        jenis: userProfile.jenis,
        // ... data lain dari userProfile
      },
      // Anda juga bisa mengembalikan session Supabase jika diperlukan di frontend
      // supabaseSession: session,
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
    // PERUBAHAN DI SINI: Sesuaikan dengan URL backend Anda
    const redirectToUrl = 'http://165.22.102.172:6500/api/user/handleresetpassword'; // <--- Ubah ini

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
      return res.status(500).json({success: false, message: 'Gagal memperbarui password di Supabase.', error: updateError.message });
    }

    // Optional: Re-authenticate to get a fresh session if needed, though update user usually refreshes it
    // Or simply confirm the password has been changed
    res.status(200).json({ success: true, message: 'Password berhasil diubah.' });

  } catch (error) {
    console.error("General error during password change:", error);
    res.status(500).json({ success: false,  message: 'Terjadi kesalahan server.', error: error.message });
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
  } = req.body;

  // Validasi input dasar
  if (!email || !password  || !namaIbu || !provinsi || !kota || !kecamatan || !kelurahan || !rt || !rw) {
    return res.status(400).json({ message: 'Semua field wajib diisi kecuali kodePos.' });
  }

  try {
    // 1. Membuat user di autentikasi Supabase
    // Supabase akan menghash password ini secara otomatis di auth.users
    const { data: supabaseUser, error: supabaseError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (supabaseError) {
      console.error("Supabase registration error:", supabaseError.message);
      if (supabaseError.message.includes("User already registered")) {
        return res.status(409).json({ message: 'Email sudah terdaftar.' }); // Pesan lebih umum
      }
      return res.status(500).json({ message: 'Gagal mendaftar user di Supabase Auth.', error: supabaseError.message });
    }

    // Pastikan user Supabase berhasil dibuat dan memiliki ID
    if (!supabaseUser || !supabaseUser.user || !supabaseUser.user.id) {
        // Ini seharusnya tidak terjadi jika tidak ada supabaseError, tapi sebagai fallback
        return res.status(500).json({ message: 'Gagal mendapatkan ID user dari Supabase Auth.' });
    }

    // 2. Membuat data User baru ke database Prisma
    // PENTING: JANGAN SIMPAN PASSWORD DI SINI. Gunakan ID dari Supabase Auth.
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          id: supabaseUser.user.id, // Gunakan ID dari Supabase Auth sebagai primary key atau foreign key
          email: email,
          jenis: 'IBU', // Set jenis user sebagai 'KADER'
        },
      });
    } catch (prismaUserError) {
      console.error("Prisma User creation error:", prismaUserError);
      // Jika pembuatan User di Prisma gagal, hapus user dari Supabase Auth
      await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      return res.status(500).json({ message: 'Gagal membuat data user di database (Prisma).', error: prismaUserError.message });
    }

    // 3. Membuat data baru di Kader
    let newIbu;
    try {
      newIbu = await prisma.ibuRumah.create({
        data: {
          id: generateRandomId(), // Oke
          nama: namaIbu, 
          provinsi: provinsi, // Oke
          kota: kota, // Oke
          kecamatan: kecamatan, // Oke
          kelurahan: kelurahan, // Oke
          rt: rt, // Oke
          rw: rw, // Oke
          kodePos: kodePos || null,
          usia: usia,
          noTelp: noTelp,
          alamat: alamat,
          user: {
            connect: {
                email: email,
            }
          }
        },
      });
    } catch (prismaKaderError) {
      console.error("Prisma Kader creation error:", prismaKaderError);
      // Jika pembuatan Kader di Prisma gagal, hapus user dari Supabase Auth dan Prisma User
      if (supabaseUser && supabaseUser.user && supabaseUser.user.id) {
        await supabaseAdmin.auth.admin.deleteUser(supabaseUser.user.id);
      }
      // PERBAIKAN: Gunakan email untuk menghapus user dari tabel Prisma
      await prisma.user.delete({ where: { email: email } }); // <--- PERBAIKAN DI SINI
      return res.status(500).json({ message: 'Gagal membuat data kader di database.', error: prismaKaderError.message });
    }

    res.status(201).json({
      message: 'Registrasi kader berhasil! Silakan cek email Anda untuk verifikasi (jika diaktifkan).',
      user: {
        id: newUser.id,
        email: newUser.email,
        jenis: newUser.jenis,
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
        // Cari di tabel User Prisma
        const prismaUser = await prisma.user.findUnique({ where: { email } });
        
        if (prismaUser) {
          // Hapus child data terlebih dahulu berdasarkan jenis
          if (prismaUser.jenis === 'KADER') {
            await prisma.kader.deleteMany({ where: { email } });
          } else if (prismaUser.jenis === 'IBU') {
            await prisma.ibuRumah.deleteMany({ where: { email } });
          }
          
          // Hapus user di Prisma
          await prisma.user.delete({ where: { email } });
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
};