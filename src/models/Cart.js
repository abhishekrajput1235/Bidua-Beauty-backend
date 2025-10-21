// models/cart.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CartItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product' },
  productId: { type: String, required: true },
  name: String,
  price: Number,
  quantity: { type: Number, default: 1, min: 1, max: 100 },
  addedAt: { type: Date, default: Date.now }
});

const CartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // null for guest carts
  sessionId: { type: String, index: true }, // optional for guests
  items: [CartItemSchema],
  status: { type: String, enum: ['active','ordered','abandoned'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date } // optional TTL or reservation
});

CartSchema.index({ user: 1, status: 1 });
module.exports = mongoose.model('Cart', CartSchema);
