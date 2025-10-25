// routes/businessProfileRoutes.js
const express = require('express');
const router = express.Router();
const {
  createBusinessProfile,
  getAllBusinessProfiles,
  getBusinessProfileById,
  getMyBusinessProfile,
  updateBusinessProfileById,
  deleteBusinessProfileById,
  activateBusinessProfile,
} = require('../controllers/businessProfileController');

const { protect } = require('../middlewares/authMiddleware'); // ✅ import protect middleware

// ✅ Create Business Profile (only logged-in users)
router.post('/business-profile', protect, createBusinessProfile);

// ✅ Get all Business Profiles (admin only if you want)
router.get('/business-profiles', getAllBusinessProfiles);

// ✅ Get Business Profile by ID
router.get('/business-profile/:id', getBusinessProfileById);

// ✅ Update Business Profile (only logged-in users)
router.put('/business-profile/:id', protect, updateBusinessProfileById);

// ✅ Activate Business Profile (only logged-in users)
router.put('/business-profile/activate/:id', protect, activateBusinessProfile);

// ✅ Delete Business Profile (only admin ideally)
router.delete('/business-profile/:id', protect, deleteBusinessProfileById);

router.get('/my-business-profile', protect, getMyBusinessProfile);

module.exports = router;
