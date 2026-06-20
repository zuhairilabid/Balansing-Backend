const express = require("express");

const userRoutes = require("./user.routes");
const kaderRoutes = require("./kader.routes");
const ibuRoutes = require("./ibu.routes");

const router = express.Router();

router.use("/user", userRoutes);
router.use("/kader", kaderRoutes);
router.use("/ibu", ibuRoutes)

module.exports = router;