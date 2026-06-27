const express = require("express");
const cors = require("cors");
require("dotenv").config();
const session = require("express-session");
const cron = require("node-cron");
const { passport } = require("./passport");
const { runScheduledBatchAnalisis, resetIbuRumahChecks, cleanupUnconfirmedUsers } = require("./controllers");

const router = require("./routers");
const NotFoundMiddleware = require("./middlewares/NotFoundHandler");
const ErrorHandlerMiddleware = require("./middlewares/ErrorHandler");

const app = express();
app.set("trust proxy", 1);
const port = 6500;

app.use(
  session({
    secret: "Service",
    resave: false,
    saveUninitialized: true,
  }),
);

app.use(cors());
app.use(express.json());
app.use("/api", router);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use(NotFoundMiddleware);
app.use(ErrorHandlerMiddleware);

cron.schedule('0 0 * * *', () => {
    console.log(`[CRON] Menjalankan pengecekan reset terjadwal pada: ${new Date().toISOString()}`);
    resetIbuRumahChecks();
}, {
    timezone: "Asia/Jakarta" // Pastikan menggunakan zona waktu yang benar
});

cron.schedule('00 00 1 * *', async () => {
  console.log('\n📅 [CRON SCHEDULER] Triggered: Batch Analisis Kader');
  console.log(`Waktu: ${new Date().toLocaleString('id-ID')}`);
  
  try {
    const result = await runScheduledBatchAnalisis();
    
    if (result.success) {
      console.log('✅ [CRON SCHEDULER] Batch analisis selesai dengan sukses');
      console.log(`   - Berhasil: ${result.summary.success.length}`); 
      console.log(`   - Dilewati: ${result.summary.skipped.length}`); 
      console.log(`   - Gagal: ${result.summary.failed.length}`); 
    } else {
      console.error('❌ [CRON SCHEDULER] Batch analisis gagal:', result.error || result.message);
    }
  } catch (error) {
    console.error('❌ [CRON SCHEDULER] Error menjalankan batch analisis:', error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Jakarta"
});

cron.schedule('0 2 * * *', async () => {
  console.log('\n🗑️ [CRON SCHEDULER] Triggered: Sapu Bersih Akun Sampah (Unconfirmed > 7 hari)');
  console.log(`Waktu: ${new Date().toLocaleString('id-ID')}`);
  await cleanupUnconfirmedUsers();
}, {
  scheduled: true,
  timezone: "Asia/Jakarta"
});


app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`); // PERBAIKI: Pakai ()
});