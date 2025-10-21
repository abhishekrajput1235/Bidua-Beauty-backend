// models/PaymentHistory.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const PaymentHistorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User", // Link to the user who made the payment
      required: true,
    },
    businessProfile: {
      type: Schema.Types.ObjectId,
      ref: "BusinessProfile", // Optional link if payment is for a business profile
      required: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    paymentMethod: {
      type: String,
      enum: ["UPI", "Credit Card", "Debit Card", "Net Banking", "COD", "Other"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed", "refunded"],
      default: "pending",
    },
    transactionId: {
      type: String, // e.g., Razorpay or gateway transaction ID
      required: true,
      unique: true,
    },
    subscriptionType: {
      type: String,
      enum: ["BRPP Annual", "Other"],
      default: "BRPP Annual",
    },
    subscriptionStartDate: {
      type: Date,
      default: Date.now,
    },
    subscriptionEndDate: {
      type: Date,
      default: function () {
        const now = new Date();
        return new Date(now.setFullYear(now.getFullYear() + 1)); // 1-year subscription by default
      },
    },
  },
  { timestamps: true } // Automatically adds createdAt & updatedAt
);

module.exports = mongoose.model("PaymentHistory", PaymentHistorySchema);
