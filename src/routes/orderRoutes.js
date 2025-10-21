const express = require("express");
const router = express.Router();
const { protect, authorizeRoles } = require("../middlewares/authMiddleware");
const { getUserOrders, getAllOrders, getOrderById } = require("../controllers/orderController");

// Fetch orders for logged-in user
router.get("/get-my-order", protect, getUserOrders);

// Fetch all orders (admin only)
router.get("/all-orders", protect, authorizeRoles('admin'), getAllOrders);

// Fetch single order by ID
router.get("/get-order/:id", protect, getOrderById);

module.exports = router;
