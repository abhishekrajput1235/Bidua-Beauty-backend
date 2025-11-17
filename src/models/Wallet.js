const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    method: {
      type: String,
      enum: ["razorpay", "cod", "refund", "manual", "reward", "adjustment"],
      default: "manual",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    status: {
      type: String,
      enum: ["success", "pending", "failed"],
      default: "success",
    },
    balanceAfter: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    transactions: [transactionSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ Automatically update balance after new transaction
walletSchema.methods.addTransaction = async function (transactionData) {
  const { type, amount } = transactionData;

  if (type === "credit") {
    this.balance += amount;
  } else if (type === "debit") {
    if (this.balance < amount) throw new Error("Insufficient wallet balance");
    this.balance -= amount;
  }

  transactionData.balanceAfter = this.balance;
  this.transactions.push(transactionData);
  await this.save();
  return this;
};

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;
