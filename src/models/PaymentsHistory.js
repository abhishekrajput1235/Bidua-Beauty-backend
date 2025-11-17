const mongoose = require("mongoose");
const { Schema } = mongoose;

const PaymentHistorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessProfile: {
      type: Schema.Types.ObjectId,
      ref: "BusinessProfile",
      required: false,
    },
    paymentFor: {
      type: String,
      enum: ["subscription", "product"],
      required: true,
    },
    order: {
      type: String,
      ref: "Order",
      required: function () {
        return this.paymentFor === "product";
      },
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
      enum: [
        "UPI",
        "Credit Card",
        "Debit Card",
        "Net Banking",
        "COD",
        "Razorpay",
        "Wallet",
        "Other",
      ],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed", "refunded"],
      default: "pending",
    },
    transactionId: {
      type: String,
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
        return new Date(now.setFullYear(now.getFullYear() + 1));
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentHistory", PaymentHistorySchema);
