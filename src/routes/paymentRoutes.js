const express = require("express");
const { createOrder, verifyPayment } = require("../controllers/paymentController");
const { verifyRazorpaySignature } = require("../middlewares/verifySignature");

const router = express.Router();

router.post("/create-order", createOrder);
router.post("/verify-payment", verifyRazorpaySignature, verifyPayment);

module.exports = router;
