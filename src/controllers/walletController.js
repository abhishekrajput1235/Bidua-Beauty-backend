const Wallet = require('../models/Wallet');
const User = require('../models/Users');

// @desc    Get user's wallet
// @route   GET /api/wallet
// @access  Private
const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id }).populate(
      "user",
      "name email phone"
    );

    if (!wallet) {
      // Create a new wallet if it doesn't exist
      let newWallet = new Wallet({
        user: req.user.id,
        balance: 0,
        transactions: [],
      });
      await newWallet.save();
      
      // Populate the user details for the newly created wallet
      wallet = await Wallet.findById(newWallet._id).populate(
        "user",
        "name email phone"
      );
    }

    res.json({data:wallet});
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
};

// @desc    Add a transaction to the user's wallet
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

    res.json({data:wallet});
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Request a withdrawal
// @route   POST /api/wallet/withdraw
// @access  Private
const requestWithdrawal = async (req, res) => {
  const { amount } = req.body;

  try {
    const numericAmount = parseFloat(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ msg: 'Invalid withdrawal amount' });
    }

    let wallet = await Wallet.findOne({ user: req.user.id });

    if (!wallet) {
      return res.status(404).json({ msg: 'Wallet not found' });
    }

    if (wallet.balance < numericAmount) {
      return res.status(400).json({ msg: 'Insufficient balance' });
    }

    const transactionData = {
      type: 'withdrawal',
      amount: numericAmount,
      description: 'Withdrawal request',
      status: 'pending',
      method: 'withdrawal',
    };

    await wallet.addTransaction(transactionData);

    res.json({ data: wallet });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Update withdrawal status
// @route   PUT /api/wallet/withdraw/:transactionId
// @access  Private/Admin
const updateWithdrawalStatus = async (req, res) => {
  const { transactionId } = req.params;
  const { status } = req.body;

  try {
    let wallet = await Wallet.findOne({ "transactions._id": transactionId });

    if (!wallet) {
      return res.status(404).json({ msg: 'Wallet not found' });
    }

    const transaction = wallet.transactions.id(transactionId);

    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }

    if (transaction.type !== 'withdrawal') {
      return res.status(400).json({ msg: 'Not a withdrawal transaction' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ msg: `Withdrawal already ${transaction.status}` });
    }

    if (status === 'approved') {
      if (wallet.balance < transaction.amount) {
        return res.status(400).json({ msg: 'Insufficient balance' });
      }
      
      transaction.status = 'approved';

      // Create a new debit transaction for the approved withdrawal
      const debitTransaction = {
        type: 'debit',
        amount: transaction.amount,
        description: `Withdrawal of ${transaction.amount} approved.`,
        method: 'withdrawal',
        status: 'success'
      };
      
      // The addTransaction method will update the balance and save
      await wallet.addTransaction(debitTransaction);

    } else if (status === 'rejected') {
      transaction.status = 'rejected';
      await wallet.save();
    } else {
      return res.status(400).json({ msg: 'Invalid status' });
    }

    // refetch wallet to have the latest state to return
    const updatedWallet = await Wallet.findById(wallet._id).populate("user", "name email phone");

    res.json({ data: updatedWallet });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};
module.exports = {
  getWallet,
  addTransaction,
  requestWithdrawal,
  updateWithdrawalStatus
};
