const express = require("express");
const router = express.Router();
const { checkoutCart } = require("../controllers/checkoutController");
const { protect } = require("../middlewares/authMiddleware"); // assuming you have auth middleware

// @desc    Checkout cart and create order
// @route   POST /api/cart/checkout
// @access  Private
router.post("/", protect, checkoutCart);

module.exports = router;
