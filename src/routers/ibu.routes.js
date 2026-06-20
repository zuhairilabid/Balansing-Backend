const express = require("express");
const { passport, authenticateJWT } = require("../passport");
const multer = require('multer');
const { getBatchAllAnak ,getAnalisisGizi ,getAnalisisSanitasi ,getIbu, getArticlebyId ,getAllArticle ,getDashboardAnak, editIbu, addAnak, getAllAnak, getAnakIbubyId, editAnakIbu, deleteAnakbyId, addRecapAnak, getRecapAnakbyId, getRecapAnakMonthly, getAllRecapAnak, cekMakanan, getAnalisisMakanan  } = require("../controllers");
const path = require('path');
const fs = require('fs'); // <--- PENTING: Tambahkan ini untuk menggunakan modul fs
const { loginRateLimiter } = require("../middlewares/RateLimit");

const router = express.Router();

// Tentukan jalur absolut untuk direktori 'uploads'
const uploadDir = path.join(__dirname, '..', 'uploads');

// Periksa apakah direktori 'uploads' ada, jika tidak, buatlah.
if (!fs.existsSync(uploadDir)) {
    console.log(`Membuat direktori: ${uploadDir}`);
    fs.mkdirSync(uploadDir, { recursive: true }); // Tambahkan recursive: true untuk memastikan parent directory ada
}

// Konfigurasi Multer untuk menyimpan file ke direktori 'uploads'
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Gunakan jalur absolut yang telah kita definisikan
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nama file unik
    }
});

const upload = multer({ storage: storage });

router.get("/profile/:email", authenticateJWT, getIbu);
router.put("/profile", authenticateJWT, editIbu);

router.post("/anak", authenticateJWT, addAnak);
router.put("/anak", authenticateJWT, editAnakIbu);
router.get("/anakDetail/:id", authenticateJWT, getAnakIbubyId);
router.get("/anak/:email", authenticateJWT, getAllAnak);
router.delete("/anak/:id", authenticateJWT, deleteAnakbyId);

router.post("/recap", authenticateJWT, addRecapAnak);

router.get("/recap/:id", authenticateJWT, getRecapAnakbyId);
router.post("/recapMonthly", authenticateJWT, getRecapAnakMonthly);
router.get("/allRecapAnak/:idAnak", authenticateJWT, getAllRecapAnak);
router.get("/dashboard/:id", authenticateJWT, getDashboardAnak);

router.post("/makanan", authenticateJWT, upload.single('file') ,cekMakanan);

router.get("/artikel", authenticateJWT, getAllArticle)
router.get("/artikel/:id", authenticateJWT, getArticlebyId)

router.post("/analisis-gizi/:id", authenticateJWT, getAnalisisGizi);
router.post("/analisis-sanitasi", authenticateJWT, getAnalisisSanitasi);
router.post("/analisis-makanan", authenticateJWT, getAnalisisMakanan);

router.get("/getbatch", getBatchAllAnak);

router.get("/test1", (req, res) => {
    res.send("Test");
}); // debugging

router.get("/test2", (req, res) => {
    res.send("Test Auth");
}); // debugging

module.exports = router;