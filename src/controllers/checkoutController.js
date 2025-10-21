const mongoose = require("mongoose");
const User = require("../models/Users");
const Product = require("../models/Products");
const Order = require("../models/Order");
const PaymentHistory = require("../models/PaymentsHistory");

const checkoutCart = async (req, res) => {
  const DEBUG = process.env.DEBUG_CHECKOUT === "true";
  const session = await mongoose.startSession();
  await session.startTransaction();

  const assignedUnitsForRollback = []; // { productId, serials: [] }

  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: missing user id" });
    }

    const { paymentMethod: bodyPaymentMethod, transactionId: bodyTransactionId, shippingAddress: bodyShippingAddress } = req.body || {};

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

    for (const cartItem of user.cart) {
      // Resolve product id
      const productRef = cartItem.product?._id || cartItem.productId;
      if (!productRef) continue;

      // Fetch product in session
      const product = await Product.findById(productRef).session(session);
      if (!product) continue;

      // Defensive: coerce stock
      product.stock = Number(product.stock || 0);

      // If no stock and no units -> skip
      if ((product.stock <= 0) && (!Array.isArray(product.units) || product.units.length === 0)) continue;

      let qtyRequested = Math.max(1, Number(cartItem.quantity || 1));
      let qtyToUse = 0;
      const serialsAssigned = [];

      // --- PRIORITIZE SERIALIZED UNITS ---
      if (Array.isArray(product.units) && product.units.length > 0) {
        // find indices of available units (explicitly check isSold === false)
        const availableUnitIndices = [];
        for (let i = 0; i < product.units.length; i++) {
          // treat undefined isSold as available (backfill later)
          const isSold = product.units[i].isSold === true;
          if (!isSold) availableUnitIndices.push(i);
        }

        if (availableUnitIndices.length > 0) {
          qtyToUse = Math.min(qtyRequested, availableUnitIndices.length);
          // mark the first qtyToUse units as sold and collect serials
          for (let k = 0; k < qtyToUse; k++) {
            const idx = availableUnitIndices[k];
            // mark sold
            product.units[idx].isSold = true;
            // collect serial value (defensive: fallback to unit._id if serial missing)
            const s = product.units[idx].serial || (product.units[idx]._id && product.units[idx]._id.toString()) || null;
            if (s) serialsAssigned.push(s);
          }

          // record rollback info
          if (serialsAssigned.length > 0) {
            assignedUnitsForRollback.push({
              productId: product._id,
              serials: serialsAssigned.slice(),
            });
          }
        }
      }

      // --- FALLBACK TO STOCK IF NOT ENOUGH SERIALS ---
      if (qtyToUse < qtyRequested) {
        const remainingNeeded = qtyRequested - qtyToUse;
        const stockAvailable = Math.max(0, Number(product.stock || 0));
        const fromStock = Math.min(remainingNeeded, stockAvailable);
        qtyToUse += fromStock;
      }

      if (qtyToUse <= 0) continue; // nothing to add

      // decrement stock by qtyToUse (if stock exists)
      product.stock = Math.max(0, Number(product.stock || 0) - qtyToUse);
      if (product.stock <= 0) product.inStock = false;

      // save product changes under session
      await product.save({ session });

      const itemPrice = product.sellingPrice || product.price || 0;
      const itemSubTotal = itemPrice * qtyToUse;
      const itemGst = itemSubTotal * ((product.gstPercentage || 0) / 100);
      const itemShipping = (product.shippingCharge || 0) * qtyToUse;

      subTotal += itemSubTotal;
      totalGst += itemGst;
      totalShipping += itemShipping;

      orderItems.push({
        product: product._id,
        quantity: qtyToUse,
        serials: serialsAssigned,
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

    // Payment & shipping
    const paymentMethod = bodyPaymentMethod || "COD";
    const paymentStatus = paymentMethod === "COD" ? "Pending" : "Completed";
    const shippingAddress = (user.address && user.address.find(a => a.isDefault)) || bodyShippingAddress || {};

    const order = new Order({
      user: user._id,
      items: orderItems,
      subTotal,
      shippingCharges: totalShipping,
      gstAmount: totalGst,
      totalAmount,
      payment: {
        method: paymentMethod,
        status: paymentStatus,
        transactionId: bodyTransactionId || null,
      },
      shippingAddress: {
        fullName: bodyShippingAddress.fullName || user.name,
        phone: bodyShippingAddress.phone || user.phone,
        street: bodyShippingAddress.street,
        city: bodyShippingAddress.city,
        state: bodyShippingAddress.state,
        postalCode: bodyShippingAddress.postalCode,
        country: bodyShippingAddress.country || 'India',
      },
      status: "Processing",
    });

    await order.save({ session });

    // Create a payment history record
    const paymentHistory = new PaymentHistory({
      user: user._id,
      amount: totalAmount,
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus === 'Completed' ? 'success' : 'pending',
      transactionId: bodyTransactionId || new mongoose.Types.ObjectId().toString(),
      subscriptionType: 'Other', // Or determine based on context
    });
    await paymentHistory.save({ session });


    // clear cart
    user.cart = [];
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "✅ Checkout successful", order });
  } catch (err) {
    // rollback assigned units (unmark isSold)
    try {
      if (assignedUnitsForRollback.length > 0) {
        for (const rec of assignedUnitsForRollback) {
          const prod = await Product.findById(rec.productId).session(session);
          if (!prod) continue;
          for (const s of rec.serials) {
            const unit = prod.units.find(u => (u.serial && u.serial === s) || (u._id && u._id.toString() === s));
            if (unit) unit.isSold = false;
          }
          await prod.save({ session });
        }
      }
    } catch (rbErr) {
      console.error("Rollback error:", rbErr);
    }

    await session.abortTransaction();
    session.endSession();
    console.error("checkout error:", err);
    return res.status(500).json({ message: "Server error during checkout", error: err.message });
  }
};

module.exports = { checkoutCart };
