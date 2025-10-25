const { razorpayInstance } = require("../config/razorpay");
const crypto = require("crypto");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const PaymentHistory = require("../models/PaymentsHistory");
const Order = require("../models/Order");


// ✅ Create Razorpay Order
const createOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    const options = {
      amount: amount * 100, // amount in paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`
    };

    const order = await razorpayInstance.orders.create(options);
    successResponse(res, "Order created successfully", { order });
  } catch (error) {
    errorResponse(res, error.message);
  }
};

// ✅ Verify Payment Signature
const verifyPayment = async (req, res) => {
  try {
    if (!req.isVerified) {
      return errorResponse(res, "Signature verification failed");
    }

    const { razorpay_payment_id, order_id } = req.body;

    // Find the order
    const order = await Order.findById(order_id);
    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Create payment history
    const paymentHistory = new PaymentHistory({
      user: order.user,
      amount: order.totalAmount,
      currency: "INR",
      paymentMethod: "Other", // You might want to get this from the client
      paymentStatus: "success",
      transactionId: razorpay_payment_id,
    });
    await paymentHistory.save();

    // Update order
    order.payment.status = "Completed";
    order.payment.transactionId = razorpay_payment_id;
    order.status = "Processing";
    await order.save();


    successResponse(res, "Payment verified and order updated successfully", { order });
  } catch (error) {
    errorResponse(res, error.message);
  }
};

module.exports = { createOrder, verifyPayment };
