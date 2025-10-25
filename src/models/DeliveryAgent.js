const mongoose = require("mongoose");

const deliveryAgentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    vehicleDetails: {
      type: String,
    },
    available: {
      type: Boolean,
      default: true,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      }
    }
  },
  { timestamps: true }
);

const DeliveryAgent = mongoose.model("DeliveryAgent", deliveryAgentSchema);

module.exports = DeliveryAgent;
