const express = require("express");
const router = express.Router();
const { getWallet, addFunds } = require("../controllers/walletController");
const { protect } = require("../middlewares/authMiddleware");

router.route("/").get(protect, getWallet);
router.route("/add-funds").post(protect, addFunds);

module.exports = router;