const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { confirmCodOrder, verifyPayment, getRazorpayKey, createBrppOrder } = require("../controllers/paymentController");

// Confirm a Cash on Delivery order
router.post("/confirm-cod", protect, confirmCodOrder);

// Verify an online payment
router.post("/verify-payment", protect, verifyPayment);

// Get Razorpay Key
router.get("/get-key", protect, getRazorpayKey);

// Create BRPP Order
router.post("/brpp-order", protect, createBrppOrder);

module.exports = router;