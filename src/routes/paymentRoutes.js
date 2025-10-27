const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { confirmCodOrder, verifyPayment, getRazorpayKey } = require("../controllers/paymentController");

// Confirm a Cash on Delivery order
router.post("/confirm-cod", protect, confirmCodOrder);

// Verify an online payment
router.post("/verify-payment", protect, verifyPayment);

// Get Razorpay Key
router.get("/get-key", protect, getRazorpayKey);

module.exports = router;