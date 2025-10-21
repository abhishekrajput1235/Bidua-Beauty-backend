
const mongoose = require("mongoose");
const crypto = require("crypto");

// stronger short id
const shortId = () => crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    b2bPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
    shippingCharge: { type: Number, min: 0, default: 50 },
    gstPercentage: { type: Number, min: 0, max: 100, default: 18 },
    category: { type: String, required: true, index: true },
    brand: { type: String, trim: true },
    stock: { type: Number, required: true, min: 0 },
    inStock: { type: Boolean, default: true },
    units: [
      {
        serial: { type: String, required: true }, // removed unique here
        isSold: { type: Boolean, default: false },
        buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    images: [{ url: { type: String, required: true }, alt: String }],
    ratings: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    tags: [String],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ensure serial uniqueness per product (compound index)
// sparse: true avoids indexing docs without units
productSchema.index({ productId: 1, "units.serial": 1 }, { unique: true, sparse: true });

// ----------------------
// Pre-save hook: ensure productId and discount
// ----------------------
productSchema.pre("save", async function (next) {
  // Create productId if not present
  if (!this.productId) {
    let uniqueId;
    let exists = true;
    while (exists) {
      uniqueId = `PRD-${shortId()}`;
      // use mongoose.models.Product to avoid overwrite errors in dev
      const existing = await mongoose.models.Product.findOne({ productId: uniqueId }).lean();
      if (!existing) exists = false;
    }
    this.productId = uniqueId;
  }

  // Calculate discount safely
  if (this.price > 0) {
    if (this.sellingPrice && this.sellingPrice > 0) {
      this.discountPercentage = Math.round(((this.price - this.sellingPrice) / this.price) * 100);
    } else if (this.b2bPrice && this.b2bPrice > 0) {
      this.sellingPrice = this.b2bPrice;
      this.discountPercentage = Math.round(((this.price - this.sellingPrice) / this.price) * 100);
    } else {
      this.discountPercentage = 0;
    }
  }

  next();
});

// ----------------------
// Robust units generator
// ----------------------
productSchema.methods.generateUnits = async function () {
  // require productId to build proper serials
  if (!this.productId) {
    throw new Error("productId required before generating units");
  }

  const currentUnitCount = this.units ? this.units.length : 0;

  // Add new units if stock increased
  if (this.stock > currentUnitCount) {
    // compute max index from existing serials (handles out-of-order arrays)
    let maxIndex = 0;
    for (const u of this.units) {
      const m = String(u.serial).match(/-U(\d+)$/);
      if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
    }

    const toAdd = this.stock - currentUnitCount;
    const newUnits = [];
    for (let i = 1; i <= toAdd; i++) {
      const idx = (maxIndex + i).toString().padStart(3, "0");
      const serial = `${this.productId}-U${idx}`;
      newUnits.push({ serial, isSold: false });
    }

    // push all at once and save; we catch duplicate-key errors to retry if needed
    this.units.push(...newUnits);
    try {
      return await this.save();
    } catch (err) {
      // If duplicate key (11000) occurs because of concurrency, attempt a single retry:
      if (err.code === 11000) {
        // reload fresh doc and try again (simple retry strategy)
        const fresh = await mongoose.models.Product.findById(this._id);
        // update this object's units from fresh and try again once
        this.units = fresh.units || [];
        return this.generateUnits();
      }
      throw err;
    }
  }

  // Remove unsold units if stock decreased
  if (this.stock < currentUnitCount) {
    let toRemove = currentUnitCount - this.stock;
    // remove from end only unsold ones
    for (let i = this.units.length - 1; i >= 0 && toRemove > 0; i--) {
      if (!this.units[i].isSold) {
        this.units.splice(i, 1);
        toRemove--;
      }
    }
    if (toRemove > 0) throw new Error("Cannot reduce stock below sold units");
    return this.save();
  }

  // No change
  return this;
};

// ----------------------
// Rating calc unchanged but ensure safe division
// ----------------------
productSchema.methods.calculateAvgRating = async function () {
  if (!this.ratings || this.ratings.length === 0) {
    this.avgRating = 0;
    this.numReviews = 0;
  } else {
    this.numReviews = this.ratings.length;
    this.avgRating = this.ratings.reduce((acc, r) => acc + (r.rating || 0), 0) / this.ratings.length;
  }
  return this.save();
};

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
module.exports = Product;
