const Order = require("../models/Order");
const BrppSubscription = require("../models/BusinessProfile");
const User = require("../models/Users");
const { activateBusinessProfile } = require("./businessProfileController");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { razorpayInstance } = require("../config/razorpay");

const confirmCodOrder = async (req, res) => {
  const { orderId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = "Processing";
    order.payment.status = "Pending"; // For COD, payment is pending until delivery

    const updatedOrder = await order.save();
    res.status(200).json({ message: "Order confirmed for Cash on Delivery", order: updatedOrder });

  } catch (error) {
    console.error("COD confirmation error:", error);
    res.status(500).json({ message: "Server error during COD confirmation", error: error.message });
  }
};

const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing Razorpay payment details" });
  }

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (isAuthentic) {
    try {
      const subscription = await BrppSubscription.findOne({ razorpayOrderId: razorpay_order_id });

      if (!subscription) {
        return res.status(404).json({ message: "Subscription not found" });
      }

      subscription.paymentId = razorpay_payment_id;
      subscription.status = "completed";
      await subscription.save();

      // Activate business profile
      await activateBusinessProfile(subscription.businessProfile);

      // Upgrade user role
      await User.findByIdAndUpdate(subscription.user, { role: "b2b" });

      res.status(200).json({ message: "Payment verified successfully" });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Server error during payment verification", error: error.message });
    }
  } else {
    res.status(400).json({ message: "Invalid signature" });
  }
};

const getRazorpayKey = (req, res) => {
  res.status(200).json({ key: process.env.RAZORPAY_KEY_ID });
};

const createBrppOrder = async (req, res) => {
  try {
    const { businessProfileId } = req.body;
    const amount = 499900; // amount in the smallest currency unit

    const options = {
      amount,
      currency: "INR",
      receipt: `receipt_brpp_${Date.now()}`,
    };

    const order = await razorpayInstance.orders.create(options);

    const newBrppSubscription = new BrppSubscription({
      user: req.user.id,
      businessProfile: businessProfileId,
      amount: amount / 100,
      razorpayOrderId: order.id,
    });

    await newBrppSubscription.save();

    res.status(200).json({
      orderId: order.id,
      amount: amount,
    });
  } catch (error) {
    console.error("Error creating BRPP order:", error);
    res.status(500).json({ message: "Server error during BRPP order creation", error: error.message });
  }
};

module.exports = {
  confirmCodOrder,
  verifyPayment,
  getRazorpayKey,
  createBrppOrder,
};
