// routes/paymentHistoryRoutes.js
const express = require("express");
const router = express.Router();
const {
  createPayment,
  getMyPayments,
  getAllPayments,
  getPaymentById,
} = require("../controllers/paymentHistoryController");

const { protect, authorizeRoles } = require("../middlewares/authMiddleware");

// ✅ Create a new payment (logged-in users)
router.post("/payments", protect, createPayment);

// ✅ Get logged-in user's payments
router.get("/my-payments", protect, getMyPayments);

// ✅ Get all payments (admin only)
router.get("/payments", protect, authorizeRoles("admin"), getAllPayments);

// ✅ Get payment by ID (user can see their own, admin can see all)
router.get("/payments/:id", protect, getPaymentById);

module.exports = router;
