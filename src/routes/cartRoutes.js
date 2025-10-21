const express = require("express");
const {
  addToCart,
  incrementCart,
  decrementCart,
  getCart,
  getCartSummary,
  removeFromCart,
  // checkoutCart,
} = require("../controllers/cartController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", protect, getCart);
router.get("/summary", protect, getCartSummary);
router.post("/add", protect, addToCart);
router.patch("/increment/:productId", protect, incrementCart);
router.patch("/decrement/:productId", protect, decrementCart);
router.delete("/:productId", protect, removeFromCart);
// router.post("/checkout", protect, checkoutCart);

module.exports = router;
