const Wallet = require("../models/Wallet");
const User = require("../models/Users");
const mongoose = require("mongoose");

// Get user's wallet
const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      // If no wallet, create one
      const newWallet = new Wallet({ user: req.user.id });
      await newWallet.save();
      // also save wallet reference in user model
      const user = await User.findById(req.user.id);
      user.wallet = newWallet._id;
      await user.save();
      return res.status(200).json(newWallet);
    }
    res.status(200).json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add funds to wallet
const addFunds = async (req, res) => {
  const { amount, description, transactionId } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ user: req.user.id }).session(session);
    if (!wallet) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Wallet not found" });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      amount,
      type: "credit",
      description,
      transactionId,
    });

    await wallet.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(200).json(wallet);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getWallet,
  addFunds,
};