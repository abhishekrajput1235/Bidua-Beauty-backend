const Order = require("../models/Order");
const mongoose = require("mongoose");

// @desc    Get orders of logged-in user
// @route   GET /api/orders/my
// @access  Private
const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).populate("user").populate("items.product");
    res.status(200).json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Admin
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user").populate("items.product");
    res.status(200).json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private/Admin
const getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId)
      .populate("user")
      .populate("items.product");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // If not admin, ensure user can only see their own order
    if (req.user.role !== "admin" && order.user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }

    res.status(200).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const createBrppOrder = async (req, res) => {
  try {
    const { amount, userId } = req.body;

    const newOrder = new Order({
      user: userId,
      totalAmount: amount,
      subTotal: amount,
      shippingCharges: 0,
      gstAmount: 0,
      items: [],
      payment: {
        method: "Online",
        status: "Pending",
      },
      status: "Pending",
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({ order_id: savedOrder._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getUserOrders,
  getAllOrders,
  getOrderById,
  createBrppOrder,
};
