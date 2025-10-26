const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  updateUserRole,
  forgotPassword,
  resetPassword,
  getAllUsers,

} = require("../controllers/usersController");

const { protect,adminOnly } = require("../middlewares/authMiddleware");

// Auth
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.put("/users/:id/role", protect, adminOnly, updateUserRole);
// router.put("/users/:id/role",  updateUserRole);



// Profile
router.get("/profile", protect, getUserProfile);
router.get("/get-users",protect,getAllUsers)
router.put("/profile", protect, updateUserProfile);
router.delete("/:id", protect, deleteUser);



module.exports = router;
