const User = require("../models/Users");
const Product = require("../models/Products");

// ----------------------
// ADD TO CART
// ----------------------
// const addToCart = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { productId, quantity = 1 } = req.body; // default 1 if not provided
//     console.log("Product ID from backed ", productId);
//     if (!productId) return res.status(400).json({ message: "ProductId required" });

//     const product = await Product.findOne( {productId} );
//     console.log("product Id and product ::",productId,product)
//     if (!product) return res.status(404).json({ message: "Product not found" });

//     const user = await User.findById(userId);

//     const existingItem = user.cart.find((item) => item.productId === productId);
//     if (existingItem) {
//       existingItem.quantity += quantity;
//     } else {
//       user.cart.push({ productId, quantity });
//     }

//     await user.save();
//     res.status(200).json({ message: "Cart updated", cart: user.cart });
//   } catch (err) {
//     console.error("❌ addToCart error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    // 🧩 Find product by productId
    const product = await Product.findOne({ productId });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ Check if product has at least one available (isSold: false) unit
    const availableUnits = product.units.filter((unit) => !unit.isSold);

    if (availableUnits.length === 0) {
      return res.status(400).json({ message: "Product is currently out of stock" });
    }

    // ✅ Optional: ensure requested quantity doesn’t exceed available units
    if (quantity > availableUnits.length) {
      return res.status(400).json({
        message: `Only ${availableUnits.length} units of ${product.name} are available`,
      });
    }

    // 👤 Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🛒 Check if product already exists in cart
    const existingItem = user.cart.find((item) => item.productId === productId);

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > availableUnits.length) {
        return res.status(400).json({
          message: `You can only add ${availableUnits.length - existingItem.quantity} more units of ${product.name}`,
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      // Add new product to cart
      user.cart.push({
        product: product._id,
        productId,
        quantity,
      });
    }

    await user.save();

    // Populate product details for frontend
    await user.populate("cart.product");

    res.status(200).json({
      message: `${product.name} added to cart successfully`,
      cart: user.cart,
    });
  } catch (err) {
    console.error("❌ addToCart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ----------------------
// ✅ INCREMENT CART (uses units.isSold to determine availability)
// ----------------------
const incrementCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ message: "ProductId required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const item = user.cart.find((i) => i.productId === productId);

    // Find product
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Determine available count using units (prefer units array; fallback to stock)
    const availableCount = Array.isArray(product.units)
      ? product.units.filter((u) => !u.isSold).length
      : (product.stock || 0);

    if (availableCount <= 0) {
      // No available units — remove from cart if present, and return error
      user.cart = user.cart.filter((i) => i.productId !== productId);
      await user.save();
      return res.status(400).json({ message: "Product is out of stock" });
    }

    if (item) {
      // Check if increasing by 1 would exceed available units
      if (item.quantity + 1 > availableCount) {
        return res.status(400).json({
          message: "Not enough units available to increase quantity",
        });
      }
      item.quantity += 1;
    } else {
      // Add new product if not exists (check available units before adding)
      if (availableCount < 1) {
        return res
          .status(400)
          .json({ message: "Not enough units available to add this product" });
      }
      user.cart.push({ productId, quantity: 1 });
    }

    await user.save();

    // Merge product info for frontend
    const cartWithProducts = await Promise.all(
      user.cart.map(async (item) => {
        const prod = await Product.findOne(
          { productId: item.productId },
          "_id productId name description price b2bPrice sellingPrice discountPercentage gstPercentage shippingCharge category brand stock images avgRating numReviews isFeatured tags createdBy ratings createdAt updatedAt units"
        );

        return {
          productId: item.productId,
          _id: prod?._id || null,
          name: prod?.name || "Deleted Product",
          description: prod?.description || "",
          price: prod?.price || 0,
          b2bPrice: prod?.b2bPrice || 0,
          sellingPrice: prod?.sellingPrice || 0,
          discountPercentage: prod?.discountPercentage || 0,
          gstPercentage: prod?.gstPercentage || 0,
          shippingCharge: prod?.shippingCharge || 0,
          category: prod?.category || "",
          brand: prod?.brand || "",
          stock: prod?.stock || 0,
          images: prod?.images || [],
          avgRating: prod?.avgRating || 0,
          numReviews: prod?.numReviews || 0,
          isFeatured: prod?.isFeatured || false,
          tags: prod?.tags || [],
          createdBy: prod?.createdBy || null,
          ratings: prod?.ratings || [],
          createdAt: prod?.createdAt || null,
          updatedAt: prod?.updatedAt || null,
          // helpful to know how many units remain client-side
          availableUnits: Array.isArray(prod?.units)
            ? prod.units.filter((u) => !u.isSold).length
            : prod?.stock || 0,
          quantity: item.quantity,
        };
      })
    );

    res.status(200).json({ message: "Cart updated", cart: cartWithProducts });
  } catch (err) {
    console.error("❌ incrementCart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------
// ✅ DECREMENT CART (uses units.isSold to determine availability)
// ----------------------
const decrementCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ message: "ProductId required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const item = user.cart.find((i) => i.productId === productId);
    if (!item) return res.status(404).json({ message: "Product not in cart" });

    // Find product
    const product = await Product.findOne({ productId });
    if (!product) {
      // If product deleted from DB, remove from cart
      user.cart = user.cart.filter((i) => i.productId !== productId);
      await user.save();
      return res.status(404).json({ message: "Product not found; removed from cart" });
    }

    // Determine available count using units (prefer units array; fallback to stock)
    const availableCount = Array.isArray(product.units)
      ? product.units.filter((u) => !u.isSold).length
      : (product.stock || 0);

    if (availableCount <= 0) {
      // If product went fully out of stock, remove from cart
      user.cart = user.cart.filter((i) => i.productId !== productId);
      await user.save();
      return res
        .status(400)
        .json({ message: "Product went out of stock and was removed from cart" });
    }

    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      // Remove product completely if quantity becomes 0
      user.cart = user.cart.filter((i) => i.productId !== productId);
    }

    await user.save();

    // Merge product info for frontend
    const cartWithProducts = await Promise.all(
      user.cart.map(async (item) => {
        const prod = await Product.findOne(
          { productId: item.productId },
          "_id productId name description price b2bPrice sellingPrice discountPercentage gstPercentage shippingCharge category brand stock images avgRating numReviews isFeatured tags createdBy ratings createdAt updatedAt units"
        );

        return {
          productId: item.productId,
          _id: prod?._id || null,
          name: prod?.name || "Deleted Product",
          description: prod?.description || "",
          price: prod?.price || 0,
          b2bPrice: prod?.b2bPrice || 0,
          sellingPrice: prod?.sellingPrice || 0,
          discountPercentage: prod?.discountPercentage || 0,
          gstPercentage: prod?.gstPercentage || 0,
          shippingCharge: prod?.shippingCharge || 0,
          category: prod?.category || "",
          brand: prod?.brand || "",
          stock: prod?.stock || 0,
          images: prod?.images || [],
          avgRating: prod?.avgRating || 0,
          numReviews: prod?.numReviews || 0,
          isFeatured: prod?.isFeatured || false,
          tags: prod?.tags || [],
          createdBy: prod?.createdBy || null,
          ratings: prod?.ratings || [],
          createdAt: prod?.createdAt || null,
          updatedAt: prod?.updatedAt || null,
          availableUnits: Array.isArray(prod?.units)
            ? prod.units.filter((u) => !u.isSold).length
            : prod?.stock || 0,
          quantity: item.quantity,
        };
      })
    );

    res.status(200).json({ message: "Cart updated", cart: cartWithProducts });
  } catch (err) {
    console.error("❌ decrementCart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// ----------------------
// GET CART WITH PRODUCT INFO
// ----------------------
const getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const cartWithProducts = await Promise.all(
      user.cart.map(async (item) => {
        const product = await Product.findOne(
          { productId: item.productId },
          "_id productId name description price b2bPrice sellingPrice discountPercentage gstPercentage shippingCharge category brand stock images avgRating numReviews isFeatured tags createdBy ratings createdAt updatedAt units"
        );

        return {
          productId: item.productId,
          _id: product?._id || null,
          name: product?.name || "Deleted Product",
          description: product?.description || "",
          price: product?.price || 0,
          b2bPrice: product?.b2bPrice || 0,
          sellingPrice: product?.sellingPrice || 0,
          discountPercentage: product?.discountPercentage || 0,
          gstPercentage: product?.gstPercentage || 0,
          shippingCharge: product?.shippingCharge || 0,
          category: product?.category || "",
          brand: product?.brand || "",
          stock: product?.stock || 0,
          images: product?.images || [],
          avgRating: product?.avgRating || 0,
          numReviews: product?.numReviews || 0,
          isFeatured: product?.isFeatured || false,
          tags: product?.tags || [],
          createdBy: product?.createdBy || null,
          ratings: product?.ratings || [],
          createdAt: product?.createdAt || null,
          updatedAt: product?.updatedAt || null,
          quantity: item.quantity,
        };
      })
    );

    res.status(200).json({ cart: cartWithProducts });
  } catch (err) {
    console.error("❌ getCart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------
// REMOVE ITEM FROM CART
// ----------------------
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.cart = user.cart.filter((i) => i.productId !== productId);
    await user.save();

    res
      .status(200)
      .json({ message: "Item removed from cart", cart: user.cart });
  } catch (err) {
    console.error("❌ removeFromCart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------
// GET CART SUMMARY (SUBTOTAL, GST, DELIVERY, GRAND TOTAL)
// ----------------------
const getCartSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.cart.length) {
      return res.status(200).json({
        subTotal: 0,
        gstAmount: 0,
        deliveryCharge: 0,
        grandTotal: 0,
        items: [],
      });
    }

    const GST_PERCENTAGE = 18;
    const DELIVERY_CHARGE = 50;

    let subTotal = 0;
    const items = await Promise.all(
      user.cart.map(async (item) => {
        const product = await Product.findOne({ productId: item.productId });
        if (!product) return null;

        const totalPrice = item.quantity * product.sellingPrice;
        subTotal += totalPrice;

        return {
          productId: product.productId,
          name: product.name,
          quantity: item.quantity,
          price: product.sellingPrice,
          totalPrice,
          images: product.images,
        };
      })
    );

    const gstAmount = (subTotal * GST_PERCENTAGE) / 100;
    const grandTotal = subTotal + gstAmount + DELIVERY_CHARGE;

    res.status(200).json({
      subTotal,
      gstAmount,
      deliveryCharge: DELIVERY_CHARGE,
      grandTotal,
      items: items.filter(Boolean),
    });
  } catch (err) {
    console.error("❌ getCartSummary error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



module.exports = {
  addToCart,
  incrementCart,
  decrementCart,
  getCart,
  removeFromCart,
  getCartSummary,
};
