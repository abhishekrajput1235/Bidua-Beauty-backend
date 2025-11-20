const express = require('express');
const router = express.Router();
const { getWallet, addTransaction, requestWithdrawal, updateWithdrawalStatus } = require('../controllers/walletController');
const { protect } = require('../middlewares/authMiddleware');

// @route   GET /api/wallet
// @desc    Get user's wallet
// @access  Private
router.get('/', protect, getWallet);

// @route   POST /api/wallet/transactions
// @desc    Add a transaction to the user's wallet
// @access  Private
router.post('/transactions', protect, addTransaction);

// @route   POST /api/wallet/withdraw
// @desc    Request a withdrawal
// @access  Private
router.post('/withdraw', protect, requestWithdrawal);

// @route   PUT /api/wallet/withdraw/:transactionId
// @desc    Update withdrawal status
// @access  Private/Admin
router.put('/withdraw/:transactionId', protect, updateWithdrawalStatus);


module.exports = router;
