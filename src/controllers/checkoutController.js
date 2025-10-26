const mongoose = require("mongoose");
const User = require("../models/Users");
const Product = require("../models/Products");
const Order = require("../models/Order");
const PaymentHistory = require("../models/PaymentsHistory");

const checkoutCart = async (req, res) => {
  const DEBUG = process.env.DEBUG_CHECKOUT === "true";
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: missing user id" });
    }

    const { paymentMethod: bodyPaymentMethod, transactionId: bodyTransactionId, shippingAddress: bodyShippingAddress, deliveryOption } = req.body || {};

    const user = await User.findById(userId).session(session).populate("cart.product");
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.cart || user.cart.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Cart is empty" });
    }

    const orderItems = [];
    let subTotal = 0;
    let totalShipping = 0;
    let totalGst = 0;

    const order = new Order({
        user: user._id,
        items: [],
        subTotal: 0,
        shippingCharges: 0,
        gstAmount: 0,
        totalAmount: 0,
        payment: {
            method: bodyPaymentMethod || "COD",
            status: bodyPaymentMethod === "COD" ? "Pending" : "Completed",
            transactionId: bodyTransactionId || null,
        },
        shippingAddress: deliveryOption === 'shipping' ? {
            fullName: bodyShippingAddress.fullName || user.name,
            phone: bodyShippingAddress.phone || user.phone,
            street: bodyShippingAddress.street,
            city: bodyShippingAddress.city,
            state: bodyShippingAddress.state,
            postalCode: bodyShippingAddress.postalCode,
            country: bodyShippingAddress.country || 'India',
        } : null,
        status: "Processing",
    });

    for (const cartItem of user.cart) {
      const productRef = cartItem.product?._id || cartItem.productId;
      if (!productRef) continue;

      const product = await Product.findById(productRef).session(session);
      if (!product) continue;

      const qtyRequested = Math.max(1, Number(cartItem.quantity || 1));
      
      const availableUnits = product.units.filter(u => !u.isSold).length;
      const stockAvailable = product.stock - availableUnits;
      const totalAvailable = availableUnits + stockAvailable;

      if (qtyRequested > totalAvailable) {
          throw new Error(`Not enough stock for product ${product.name}. Requested: ${qtyRequested}, Available: ${totalAvailable}`);
      }

      await product.sell(qtyRequested, order._id);

      const itemPrice = user.role === 'b2b' ? product.b2bPrice : product.sellingPrice || product.price || 0;
      const itemSubTotal = itemPrice * qtyRequested;
      const itemGst = itemSubTotal * ((product.gstPercentage || 0) / 100);
      const itemShipping = (product.shippingCharge || 0) * qtyRequested;

      subTotal += itemSubTotal;
      totalGst += itemGst;
      totalShipping += itemShipping;

      orderItems.push({
        product: product._id,
        quantity: qtyRequested,
        serials: product.units.filter(u => u.isSold).slice(-qtyRequested).map(u => u.serial),
        price: itemPrice,
        gstAmount: itemGst,
        shippingCharge: itemShipping,
      });
    }

    const totalAmount = subTotal + totalGst + totalShipping;

    if (orderItems.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "No available items in cart for checkout" });
    }

    order.items = orderItems;
    order.subTotal = subTotal;
    order.shippingCharges = totalShipping;
    order.gstAmount = totalGst;
    order.totalAmount = totalAmount;

    await order.save({ session });

    const paymentHistory = new PaymentHistory({
      user: user._id,
      amount: totalAmount,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status === 'Completed' ? 'completed' : 'pending',
      transactionId: !order.payment.transactionId || order.payment.transactionId === 'shipping' ? new mongoose.Types.ObjectId().toString() : order.payment.transactionId,
      subscriptionType: 'Other',
      paymentFor: 'product',
      order: order._id,
    });
    await paymentHistory.save({ session });

    user.cart = [];
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "✅ Checkout successful", order });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("checkout error:", err);
    return res.status(500).json({ message: "Server error during checkout", error: err.message });
  }
};

module.exports = { checkoutCart };