const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },
        serials: [{ type: String, required: true }], // Assigned serials
        price: { type: Number, required: true },
        gstAmount: { type: Number, required: true },
        shippingCharge: { type: Number, required: true },
        status: {
          type: String,
          enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
          default: "Pending",
        },
      },
    ],
    subTotal: { type: Number, required: true },
    shippingCharges: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    totalAmount: {
      type: Number,
      required: true,
    },
    payment: {
      method: { type: String, enum: ["UPI", "Credit Card", "Debit Card", "Net Banking", "COD", "Other"], default: "COD" },
      status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
      transactionId: String, // for online payments
    },
    status: {
      type: String,
      enum: ["Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Processing",
    },
    shippingAddress: {
      fullName: String,
      phone: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: "India" },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
