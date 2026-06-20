const express = require("express");
const { passport } = require("../passport");
const { authenticateJWT } = require("../passport");

const { 
  getKader, 
  editKader, 
  changePassword, 
  unggahAnak, 
  getRecap, 
  getRecapById, 
  editAnak, 
  deleteAnak, 
  getAnakKaderByMonth, 
  getAnalisisKader, 
  runBatchAnalisisKader  
} = require("../controllers");

const router = express.Router();

// Semua routes Anda
router.get("/profile/:email", authenticateJWT, getKader);
router.get("/recap/:email", authenticateJWT, getRecap);
router.get("/detailRecap/:id", authenticateJWT, getRecapById);
router.post("/filterAnak", authenticateJWT, getAnakKaderByMonth);

router.put("/profile/edit", authenticateJWT, editKader);
router.put("/password", authenticateJWT, changePassword);
router.put("/anak", authenticateJWT, editAnak);

router.post("/anak", authenticateJWT, unggahAnak);
router.delete("/anak/:id", authenticateJWT, deleteAnak);

router.get("/analisis/:idKader", authenticateJWT, getAnalisisKader);
router.post("/analisis/batch/run", authenticateJWT, runBatchAnalisisKader);

router.get("/test1", (req, res) => {
  res.send("Test");
});

module.exports = router;