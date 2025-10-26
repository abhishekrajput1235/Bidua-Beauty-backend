const express = require("express");
const router = express.Router();
const { protect, authorizeRoles } = require("../middlewares/authMiddleware");
const { getUserOrders, getAllOrders, getOrderById, createBrppOrder, updateProductStatusInOrder } = require("../controllers/orderController");

// Create BRPP order
router.post("/brpp", protect, createBrppOrder);

// Fetch orders for logged-in user
router.get("/get-my-order", protect, getUserOrders);

// Fetch all orders (admin only)
router.get("/all-orders", protect, authorizeRoles('admin'), getAllOrders);

// Fetch single order by ID
router.get("/get-order/:id", protect, getOrderById);

// Update product status in order (admin only)
router.put("/:orderId/product/:productId/status", protect, authorizeRoles('admin'), updateProductStatusInOrder);

module.exports = router;
