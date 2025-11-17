const Order = require("../models/Order");
const mongoose = require("mongoose");
const Product = require("../models/Products");
const User = require("../models/Users");
const PaymentHistory = require("../models/PaymentsHistory");
const { razorpayInstance } = require("../config/razorpay");
const crypto = require("crypto");
const Wallet = require("../models/Wallet");





const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: missing user id" });
    }

    const { cart, shippingAddress, paymentMethod, deliveryOption } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Normalize methods
    function normalizePaymentMethod(m) {
      if (!m || typeof m !== "string") return "COD";
      const s = m.trim().toLowerCase();
      if (s === "upi") return "UPI";
      if (s === "credit" || s === "credit card") return "Credit Card";
      if (s === "debit" || s === "debit card") return "Debit Card";
      if (s === "net" || s === "net banking") return "Net Banking";
      if (s === "cod" || s === "cashondelivery" || s === "cash on delivery") return "COD";
      if (s === "wallet") return "Wallet";
      return "Other";
    }

    function normalizePaymentStatus(s) {
      if (!s || typeof s !== "string") return "Pending";
      const v = s.trim().toLowerCase();
      if (v === "completed" || v === "success") return "Completed";
      if (v === "failed" || v === "error") return "Failed";
      return "Pending";
    }

    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    const orderItems = [];
    let subTotal = 0;
    let totalShipping = 0;
    let totalGst = 0;

    for (const cartItem of cart) {
      let product;

      if (mongoose.Types.ObjectId.isValid(cartItem.productId)) {
        product = await Product.findById(cartItem.productId).session(session);
      }

      if (!product) {
        product = await Product.findOne({ productId: cartItem.productId }).session(session);
      }

      if (!product) {
        throw new Error(`Product with ID or productId "${cartItem.productId}" not found`);
      }

      const qtyRequested = cartItem.quantity;
      const isB2BWarehouse = user.role === 'b2b' && deliveryOption === 'warehouse';

      const itemPrice = user.role === "b2b" ? product.b2bPrice : product.sellingPrice;
      const itemSubTotal = itemPrice * qtyRequested;
      const itemGst = itemSubTotal * (product.gstPercentage / 100);
      const itemShipping = product.shippingCharge * qtyRequested;

      subTotal += itemSubTotal;
      totalGst += itemGst;
      totalShipping += itemShipping;

      const serials = product.units
        .filter((u) => u.isSold)
        .slice(-qtyRequested)
        .map((u) => u.serial);

      if (isB2BWarehouse) {
        // For B2B warehouse orders, don't mark as sold, just assign to queue
        orderItems.push({
          product: product._id,
          quantity: qtyRequested,
          serials,
          price: itemPrice,
          gstAmount: itemGst,
          shippingCharge: itemShipping,
          status: "In Queue",
        });
      } else {
        // For all other orders, mark as sold
        await product.sell(qtyRequested, "temp_order_id");

        orderItems.push({
          product: product._id,
          quantity: qtyRequested,
          serials,
          price: itemPrice,
          gstAmount: itemGst,
          shippingCharge: itemShipping,
          status: "Processing",
        });
      }
    }

    const totalAmount = subTotal + totalGst + totalShipping;

    // B2B minimum order value check
    if (user.role === "b2b" && totalAmount < 2000) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "B2B users must have a minimum order value of ₹20,000." });
    }

    const orderLevelStatus = normalizedPaymentMethod === "COD" ? "Processing" : "Pending Payment";

    const orderData = {
      user: userId,
      items: orderItems,
      subTotal,
      shippingCharges: totalShipping,
      gstAmount: totalGst,
      totalAmount,
      payment: {
        method: normalizedPaymentMethod,
        status: normalizePaymentStatus(
          req.body?.payment?.status ||
          (normalizedPaymentMethod === "COD" ? "Pending" : "Pending")
        ),
      },
      shippingAddress: deliveryOption === "shipping" ? shippingAddress : null,
      orderStatus: orderLevelStatus,
      deliveryOption: deliveryOption,
    };

    if (normalizedPaymentMethod !== "COD") {
      const razorpayOrder = await razorpayInstance.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: "INR",
        receipt: `receipt_order_${new Date().getTime()}`,
      });
      orderData.payment.razorpayOrderId = razorpayOrder.id;
    }

    const order = new Order(orderData);
    await order.save({ session });

    if (user.role === "b2b" && normalizedPaymentMethod === "Wallet") {
      let wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) {
        // B2B users should ideally have a wallet created upon registration or role change.
        // For now, we can create one if it doesn't exist.
        wallet = new Wallet({ user: userId, balance: 0 });
      }

      if (wallet.balance < totalAmount) {
        throw new Error(`Insufficient wallet balance. Wallet has ${wallet.balance}, but order requires ${totalAmount}.`);
      }

      wallet.balance -= totalAmount;

      const transactionData = {
        type: "debit",
        amount: totalAmount,
        description: `Payment for order #${order._id}`,
        method: "wallet",
        orderId: order._id,
        status: "success",
        balanceAfter: wallet.balance,
      };

      wallet.transactions.push(transactionData);
      await wallet.save({ session });
    }

    // Create a pending payment history record
    if (order.payment.razorpayOrderId) {
      const paymentRecord = new PaymentHistory({
        user: userId,
        order: order._id,
        paymentFor: "product",
        amount: totalAmount,
        currency: "INR",
        paymentMethod: "Razorpay",
        paymentStatus: "pending",
        transactionId: order.payment.razorpayOrderId,
      });
      await paymentRecord.save({ session });
    }

    // Replace temp_order_id with real order _id in product stock history
    for (const item of order.items) {
      const product = await Product.findById(item.product).session(session);
      if (product) {
        product.stockHistory.forEach((history) => {
          if (history.description === "Order #temp_order_id") {
            history.description = `Order #${order._id}`;
          }
        });
        await product.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    // ✅ CLEAR CART after successful order creation
    // If you store the cart in the User model:
    await User.findByIdAndUpdate(userId, { $set: { cart: [] } });

    res.status(201).json({
      message: "Order created successfully and cart cleared",
      order,
      razorpayOrderId: order.payment.razorpayOrderId,
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Create order error:", error);
    res.status(500).json({
      message: "Server error during order creation",
      error: error.message,
    });
  }
};



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
      orderStatus: "Pending Payment",
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({ order_id: savedOrder._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const updateProductStatusInOrder = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid order or product ID" });
    }

    const order = await Order.findById(orderId).populate("items.product");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const item = order.items.find(i => i.product._id.toString() === productId);
    if (!item) return res.status(404).json({ message: "Product not found in order" });

    // Update item status in order
    item.status = status;
    await order.save();

    // Update product status in Product collection
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { status },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: "Product not found in database" });

    // Update order status if all items delivered
    const allDelivered = order.items.every(i => i.status === "Delivered");
    if (allDelivered && order.orderStatus !== "Delivered") {
      order.orderStatus = "Delivered";
      await order.save();
    }

    res.status(200).json({
      message: "Item and Product status updated successfully",
      item,
      product: updatedProduct,
      orderStatus: order.orderStatus,
    });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ message: "Server error" });
  }
};


const verifyOrderPayment = async (req, res) => {
  const crypto = require("crypto");
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
      const order = await Order.findOne({ "payment.razorpayOrderId": razorpay_order_id });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      order.payment.paymentId = razorpay_payment_id;
      order.payment.status = "Completed";
      order.orderStatus = "Processing";
      await order.save();

      // Update the payment history record
      const paymentRecord = await PaymentHistory.findOne({ transactionId: razorpay_order_id });
      if (paymentRecord) {
        paymentRecord.paymentStatus = "success";
        await paymentRecord.save();
      }

      res.status(200).json({ message: "Payment verified successfully", order });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Server error during payment verification", error: error.message });
    }
  } else {
    res.status(400).json({ message: "Invalid signature" });
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getAllOrders,
  getOrderById,
  createBrppOrder,
  updateProductStatusInOrder,
  verifyOrderPayment,
};