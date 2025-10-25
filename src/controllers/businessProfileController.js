const BusinessProfile = require("../models/BusinessProfile");
const User = require("../models/Users");

/**
 * @desc Create a new Business Profile and upgrade user role to B2B
 */
const createBusinessProfile = async (req, res) => {
  try {
    const { businessName, ownerName, phone, email, address, gstNumber } = req.body;

    // ✅ 1. Validate required fields
    if (!businessName || !ownerName || !phone || !email || !address) {
      return res.status(400).json({ message: "All required fields must be filled." });
    }

    // ✅ 2. Validate phone (10 digits only)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits." });
    }

    // ✅ 3. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // ✅ 4. Check if Business Profile already exists for this email
    const existingProfile = await BusinessProfile.findOne({ email });
    if (existingProfile) {
      return res.status(400).json({ message: "A profile with this email already exists." });
    }

    // ✅ 5. Create new Business Profile
    const newProfile = new BusinessProfile({
      user: req.user.id,
      businessName,
      ownerName,
      phone,
      email,
      address,
      gstNumber: gstNumber || null,
    });

    const savedProfile = await newProfile.save();

    // ✅ 6. Upgrade user role to B2B (only if authenticated user exists)
    if (req.user && req.user.id) {
      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { role: "b2b" },
        { new: true }
      );

      if (!updatedUser) {
        console.warn(`⚠️ Could not find user with ID ${req.user.id} to upgrade role.`);
      }
    }

    return res.status(201).json({
      message: "Business profile created successfully and user upgraded to B2B.",
      data: savedProfile,
    });
  } catch (error) {
    console.error("❌ Error creating business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get all Business Profiles
 */
const getAllBusinessProfiles = async (req, res) => {
  try {
    const profiles = await BusinessProfile.find().sort({ createdAt: -1 });
    return res.status(200).json({ data: profiles });
  } catch (error) {
    console.error("❌ Error fetching business profiles:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get Business Profile by ID
 */
const getBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await BusinessProfile.findById(id);

    if (!profile) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    return res.status(200).json({ data: profile });
  } catch (error) {
    console.error("❌ Error fetching business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Get logged-in user's Business Profile
 */
const getMyBusinessProfile = async (req, res) => {
  try {
    const profile = await BusinessProfile.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(404).json({ message: "Business profile not found for this user." });
    }
    return res.status(200).json({ data: profile });
  } catch (error) {
    console.error("❌ Error fetching my business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


/**
 * @desc Update Business Profile
 */
const updateBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessName, ownerName, phone, email, address, gstNumber } = req.body;

    const updatedProfile = await BusinessProfile.findByIdAndUpdate(
      id,
      { businessName, ownerName, phone, email, address, gstNumber },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    return res.status(200).json({
      message: "Business profile updated successfully.",
      data: updatedProfile,
    });
  } catch (error) {
    console.error("❌ Error updating business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc Delete Business Profile
 */
const deleteBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProfile = await BusinessProfile.findByIdAndDelete(id);

    if (!deletedProfile) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    return res.status(200).json({ message: "Business profile deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



const activateBusinessProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProfile = await BusinessProfile.findByIdAndUpdate(
      id,
      {
        subscriptionStatus: "active",
        subscriptionStartDate: Date.now(),
        subscriptionEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({ message: "Business profile not found." });
    }

    return res.status(200).json({
      message: "Business profile activated successfully.",
      data: updatedProfile,
    });
  } catch (error) {
    console.error("❌ Error activating business profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createBusinessProfile,
  getAllBusinessProfiles,
  getBusinessProfileById,
  getMyBusinessProfile,
  updateBusinessProfileById,
  deleteBusinessProfileById, 
  activateBusinessProfile,
};
