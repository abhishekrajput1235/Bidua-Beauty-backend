const Wallet = require('../models/Wallet');
const User = require('../models/Users');

// @desc    Get user's wallet
// @route   GET /api/wallet
// @access  Private
const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    res.json(wallet);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Add a transaction to the wallet
// @route   POST /api/wallet/transactions
// @access  Private (for now, can be restricted to admin)
const addTransaction = async (req, res) => {
  const { type, amount, description, method, orderId, status } = req.body;

  try {
    let wallet = await Wallet.findOne({ user: req.user.id });

    if (!wallet) {
      // Create a new wallet if it doesn't exist
      wallet = new Wallet({
        user: req.user.id,
      });
    }

    const transactionData = {
      type,
      amount,
      description,
      method,
      orderId,
      status,
    };

    await wallet.addTransaction(transactionData);

    res.json(wallet);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get all transactions for the user's wallet
// @route   GET /api/wallet/transactions
// @access  Private
const getWalletTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    res.json(wallet.transactions);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getWallet,
  addTransaction,
  getWalletTransactions,
};
