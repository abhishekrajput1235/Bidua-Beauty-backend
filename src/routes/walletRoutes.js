const express = require('express');
const router = express.Router();
const { getWallet, addTransaction, getWalletTransactions } = require('../controllers/walletController');
const { protect } = require('../middlewares/authMiddleware');

// @route   GET /api/wallet
// @desc    Get user's wallet
// @access  Private
router.get('/', protect, getWallet);

// @route   POST /api/wallet/transactions
// @desc    Add a transaction to the wallet
// @access  Private
router.post('/transactions', protect, addTransaction);

// @route   GET /api/wallet/transactions
// @desc    Get all transactions for the user's wallet
// @access  Private
router.get('/transactions', protect, getWalletTransactions);

module.exports = router;
