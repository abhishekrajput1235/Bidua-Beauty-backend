// routes/businessProfileRoutes.js
const express = require('express');
const router = express.Router();

const {
  createBusinessProfile,
  verifyPaymentAndActivate,
  razorpayWebhookHandler,
  getAllBusinessProfiles,
  getBusinessProfileById,
  getMyBusinessProfile,
  updateBusinessProfileById,
  deleteBusinessProfileById,
} = require('../controllers/businessProfileController');

const { protect } = require('../middlewares/authMiddleware'); // adjust path if different

// Create Business Profile (only logged-in users)
router.post('/business-profile', createBusinessProfile);

// Frontend calls this after Razorpay Checkout success to verify signature & activate
router.post('/business-profile/verify', protect, verifyPaymentAndActivate);

// Razorpay webhook (do NOT protect with auth middleware)
router.post('/webhook/razorpay', razorpayWebhookHandler);

// Get all Business Profiles (consider protecting for admin)
router.get('/business-profiles', getAllBusinessProfiles);

// Get Business Profile by ID
router.get('/business-profile/:id', getBusinessProfileById);

// Update Business Profile (only logged-in users)
router.put('/business-profile/:id', protect, updateBusinessProfileById);

// Delete Business Profile (only logged-in users/admin)
router.delete('/business-profile/:id', protect, deleteBusinessProfileById);

// Get logged-in user's Business Profile
router.get('/my-business-profile', protect, getMyBusinessProfile);

module.exports = router;
