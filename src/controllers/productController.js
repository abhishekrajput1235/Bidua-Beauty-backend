const mongoose = require('mongoose');
const Product = require("../models/Products");

// @desc    Add a new product
// @route   POST /api/products
// @access  Admin

const addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      sellingPrice,
      b2bPrice,
      category,
      brand,
      stock = 0,
      isFeatured = false,
      tags = [],
    } = req.body;

    const images = req.files ? req.files.map(file => ({ url: `/upload/products/${file.filename}` })) : [];

    // create product instance WITHOUT calling generateUnits yet
    const product = new Product({
      // you do not need to preassign _id unless you want to
      name,
      description,
      price,
      sellingPrice,
      b2bPrice,
      category,
      brand,
      stock,
      images,
      isFeatured,
      tags,
      createdBy: req.user.id,
    });

    // Save first so pre('save') sets productId (and other defaults)
    await product.save();

    // Now product.productId exists — generate units according to stock
    const savedWithUnits = await product.generateUnits(); // returns saved doc

    // savedWithUnits contains units and productId
    return res.status(201).json({ message: "Product created successfully", product: savedWithUnits });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};



// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Admin
// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Admin
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    // Find product by Mongo ID or custom productId
    let product = await Product.findById(id) || await Product.findOne({ productId: id });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const allowedFields = [
      "name",
      "description",
      "price",
      "sellingPrice",
      "b2bPrice",
      "category",
      "brand",
      "isFeatured",
      "tags",
    ];

    // Update allowed fields
allowedFields.forEach((field) => {
  if (Object.prototype.hasOwnProperty.call(updates, field) && updates[field] !== undefined) {
    const numericFields = ["price", "sellingPrice", "b2bPrice", "stock"];
    product[field] = numericFields.includes(field)
      ? parseFloat(updates[field])
      : updates[field];
  }
});


    // Handle images
    let existingImages = [];
    if (updates.existingImages) {
      // Convert strings to objects to match schema
      existingImages = Array.isArray(updates.existingImages)
        ? updates.existingImages.map((url) => ({ url }))
        : [{ url: updates.existingImages }];
    }

    let newImages = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      newImages = req.files.map((file) => ({
        url: `/upload/products/${file.filename}`,
        alt: file.originalname || "Product Image",
      }));
    }

    // Combine existing and new images
    product.images = [...existingImages, ...newImages];

    // Stock handling
    if (updates.stock !== undefined) {
      const newStock = parseInt(updates.stock, 10);
      if (isNaN(newStock)) return res.status(400).json({ message: "Stock must be a number" });
      if (newStock < 0) return res.status(400).json({ message: "Stock cannot be negative" });

      // Only generate units if the stock has actually changed
      if (newStock !== product.stock) {
        product.stock = newStock;
        await product.generateUnits(); // Update units array
      }
    }

    // Recalculate discount
    if (product.price && product.sellingPrice) {
      const discount = ((product.price - product.sellingPrice) / product.price) * 100;
      product.discountPercentage = Math.max(0, Math.round(discount));
    } else if (product.price && product.b2bPrice) {
      product.sellingPrice = product.b2bPrice;
      const discount = ((product.price - product.sellingPrice) / product.price) * 100;
      product.discountPercentage = Math.max(0, Math.round(discount));
    } else {
      product.discountPercentage = 0;
    }

    await product.save();
    res.status(200).json({ message: "Product updated successfully", product });
  } catch (err) {
    console.error("❌ updateProduct error:", err);
    if (err.message === "Cannot reduce stock below sold units") {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Server error" });
  }
};

//Add new Stock

// Controller to add stock safely
const addStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { additionalStock } = req.body;

    if (!additionalStock || additionalStock <= 0) {
      return res.status(400).json({ message: "additionalStock must be a positive number" });
    }

    // Load the product
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Update stock
    product.stock += additionalStock;

    // Concurrency-safe units generation
    const generateNewUnits = async () => {
      const currentUnitCount = product.units ? product.units.length : 0;

      // Find max serial index
      let maxIndex = 0;
      for (const u of product.units) {
        const m = String(u.serial).match(/-U(\d+)$/);
        if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
      }

      const newUnits = [];
      for (let i = 1; i <= additionalStock; i++) {
        const idx = (maxIndex + i).toString().padStart(5, "0"); // 5-digit serial
        const serial = `${product.productId}-U${idx}`;
        newUnits.push({ serial, isSold: false });
      }

      product.units.push(...newUnits);

      try {
        return await product.save();
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate key: reload fresh doc and retry once
          const fresh = await Product.findById(product._id);
          product.units = fresh.units || [];
          return generateNewUnits();
        }
        throw err;
      }
    };

    const updatedProduct = await generateNewUnits();

    res.status(200).json({
      message: `${additionalStock} units added successfully`,
      product: updatedProduct,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.status(200).json({ message: "Product deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Add rating to a product
// @route   POST /api/products/:id/rate
// @access  Private
const addRating = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const alreadyRated = product.ratings.find(
      (r) => r.user.toString() === req.user.id
    );

    if (alreadyRated) {
      // Update rating
      alreadyRated.rating = rating;
      alreadyRated.comment = comment;
    } else {
      product.ratings.push({
        user: req.user.id,
        rating,
        comment,
      });
    }

    await product.calculateAvgRating();
    res.status(200).json({ message: "Rating added", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  addRating,
  addStock,
};


