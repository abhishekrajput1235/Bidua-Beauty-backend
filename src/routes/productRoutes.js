const express = require("express");
const router = express.Router();
const {
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  addRating,
  addStock,
} = require("../controllers/productController");
const { protect, authorizeRoles } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload"); // Multer instance

// -------------------
// Public routes
// -------------------
router.get("/", getProducts);          // GET /api/products          → Get all products
router.get("/:id", getProductById);   // GET /api/products/:id      → Get product by ID

// -------------------
// Protected/Admin routes
// -------------------
// Add product with max 5 images
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  upload,
  addProduct
);

router.post("/:productId/add-stock", addStock);
// Update product with max 5 images
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  upload,
  updateProduct
);

// Delete product
router.delete("/:id", protect, authorizeRoles("admin"), deleteProduct);

// -------------------
// User routes
// -------------------
router.post("/:id/rate", protect, addRating); // POST /api/products/:id/rate → Add rating

module.exports = router;
