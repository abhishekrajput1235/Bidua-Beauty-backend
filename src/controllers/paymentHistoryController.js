// controllers/paymentHistoryController.js
const PaymentHistory = require("../models/PaymentHistory");
const User = require("../models/Users");
const BusinessProfile = require("../models/BusinessProfile");

/**
 * @desc Record a new payment
 */
const createPayment = async (req, res) => {
  try {
    const {
      businessProfileId,
      amount,
      currency,
      paymentMethod,
      paymentStatus,
      transactionId,
      subscriptionType,
      subscriptionStartDate,
      subscriptionEndDate,
    } = req.body;

    if (!amount || !paymentMethod || !transactionId) {
      return res.status(400).json({ message: "Required fields missing." });
    }

    const payment = new PaymentHistory({
      user: req.user.id,
      businessProfile: businessProfileId || null,
      amount,
      currency: currency || "INR",
      paymentMethod,
      paymentStatus: paymentStatus || "pending",
      transactionId,
      subscriptionType: subscriptionType || "BRPP Annual",
      subscriptionStartDate: subscriptionStartDate || Date.now(),
      subscriptionEndDate: subscriptionEndDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    });

    const savedPayment = await payment.save();

    return res.status(201).json({
      message: "Payment recorded successfully",
      data: savedPayment,
    });
  } catch (error) {
    console.error("❌ Error creating payment:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get all payments for the logged-in user
 */
const getMyPayments = async (req, res) => {
  try {
    const payments = await PaymentHistory.find({ user: req.user.id })
      .populate("businessProfile", "businessName")
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("❌ Error fetching payments:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get all payments (Admin only)
 */
const getAllPayments = async (req, res) => {
  try {
    const payments = await PaymentHistory.find()
      .populate("user", "name email")
      .populate("businessProfile", "businessName")
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("❌ Error fetching all payments:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get payment by ID
 */
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await PaymentHistory.findById(id)
      .populate("user", "name email")
      .populate("businessProfile", "businessName");

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Ensure user can only see their own payment unless admin
    if (req.user.role !== "admin" && payment.user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.status(200).json({ data: payment });
  } catch (error) {
    console.error("❌ Error fetching payment:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createPayment,
  getMyPayments,
  getAllPayments,
  getPaymentById,
};
