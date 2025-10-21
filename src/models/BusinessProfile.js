// models/BusinessProfile.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const BusinessProfileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User", // ✅ Link to user
      required: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    gstNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // ✅ Subscription fields
    subscriptionStatus: {
      type: String,
      enum: ['active', 'expired'],
      default: 'active',
    },
    subscriptionStartDate: {
      type: Date,
      default: Date.now,
    },
    subscriptionEndDate: {
      type: Date,
      default: function () {
        const now = new Date();
        return new Date(now.setFullYear(now.getFullYear() + 1));
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BusinessProfile', BusinessProfileSchema);
