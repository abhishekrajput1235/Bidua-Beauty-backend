// controllers/businessController.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const BusinessProfile = require("../models/BusinessProfile");
const User = require("../models/Users");
const PaymentHistory = require("../models/PaymentsHistory");
const { razorpayInstance } = require("../config/razorpay");

const SUBSCRIPTION_AMOUNT_INR = 4999; // ₹4999 Annual Subscription

/**
 * 🏢 Create a Business Profile & initiate Razorpay payment
 */
const createBusinessProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { businessName, ownerName, phone, email, address, gstNumber } = req.body;

    // 🔹 Input Validation
    if (!businessName || !ownerName || !phone || !email || !address) {
      return res.status(400).json({ message: "All required fields must be filled." });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    const existingProfile = await BusinessProfile.findOne({ email }).session(session);
    if (existingProfile) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "A profile with this email already exists." });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: missing user ID." });
    }

    // ✅ Step 1: Create Pending Business Profile
    const newProfile = new BusinessProfile({
      user: userId,
      businessName,
      ownerName,
      phone,
      email,
      address,
      gstNumber: gstNumber || null,
      subscriptionStatus: "pending",
    });

    const savedProfile = await newProfile.save({ session });

    // ✅ Step 2: Create Razorpay Order
    const amountPaise = Math.round(SUBSCRIPTION_AMOUNT_INR * 100);
    const receipt = `BRPP_${savedProfile._id.toString().slice(-6)}_${Date.now().toString().slice(-6)}`;

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        businessProfileId: savedProfile._id.toString(),
        userId: userId.toString(),
        email,
        phone,
      },
    });

    // ✅ Step 3: Record Pending Payment in PaymentHistory
    const paymentRecord = new PaymentHistory({
      user: userId,
      businessProfile: savedProfile._id,
      paymentFor: "subscription", // required field
      order: `order_${razorpayOrder.id}`, // safe string ID, not ObjectId
      amount: SUBSCRIPTION_AMOUNT_INR,
      currency: "INR",
      paymentMethod: "Razorpay", // ✅ matches schema enum (case-sensitive)
      paymentStatus: "pending", // ✅ matches enum ("pending", "success", "failed", "refunded")
      transactionId: razorpayOrder.id, // unique string
      subscriptionType: "BRPP Annual",
      subscriptionStartDate: new Date(), // optional, schema defaults too
      subscriptionEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    });

    await paymentRecord.save({ session });

    // ✅ Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Business profile created successfully. Proceed to payment.",
      businessProfile: savedProfile,
      paymentRecord,
      razorpayOrder,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: SUBSCRIPTION_AMOUNT_INR,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error creating business profile:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * 💳 Verify Razorpay Payment and Activate Subscription
 */
const verifyPaymentAndActivate = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, businessProfileId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !businessProfileId) {
      return res.status(400).json({ message: "Missing required payment verification fields." });
    }

    // ✅ Step 1: Verify Razorpay Signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature." });
    }

    // ✅ Step 2: Find Business Profile
    const profile = await BusinessProfile.findById(businessProfileId);
    if (!profile) return res.status(404).json({ message: "Business profile not found." });

    // ✅ Step 3: Activate Subscription
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);

    profile.subscriptionStatus = "active";
    profile.subscriptionStartDate = start;
    profile.subscriptionEndDate = end;
    await profile.save();

    // ✅ Step 4: Update User Role
    await User.findByIdAndUpdate(profile.user, { role: "b2b" });

    // ✅ Step 5: Update or Create Payment History
    const paymentRecord = await PaymentHistory.findOne({ transactionId: razorpay_order_id });
    if (paymentRecord) {
      paymentRecord.paymentStatus = "completed";
      paymentRecord.transactionId = razorpay_payment_id;
      paymentRecord.subscriptionStartDate = start;
      paymentRecord.subscriptionEndDate = end;
      await paymentRecord.save();
    } else {
      await new PaymentHistory({
        user: profile.user,
        businessProfile: profile._id,
        amount: SUBSCRIPTION_AMOUNT_INR,
        currency: "INR",
        paymentMethod: "Razorpay",
        paymentStatus: "success",
        transactionId: razorpay_payment_id,
        subscriptionType: "BRPP Annual",
        subscriptionStartDate: start,
        subscriptionEndDate: end,
        paymentFor: "subscription",
        order: razorpay_order_id,
      }).save();
    }

    return res.status(200).json({
      message: "✅ Payment verified and subscription activated successfully.",
      profile,
    });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * 🔔 Razorpay Webhook Handler
 */
const razorpayWebhookHandler = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const generated = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("hex");
    if (generated !== signature) {
      console.warn("⚠️ Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;

    if (event?.event === "payment.captured" || event?.event === "payment.authorized") {
      const paymentEntity = event.payload?.payment?.entity || {};
      const notes = paymentEntity.notes || {};
      const bpId = notes.businessProfileId;

      if (bpId) {
        const profile = await BusinessProfile.findById(bpId);
        if (profile && profile.subscriptionStatus !== "active") {
          const start = new Date();
          const end = new Date(start);
          end.setFullYear(end.getFullYear() + 1);

          profile.subscriptionStatus = "active";
          profile.subscriptionStartDate = start;
          profile.subscriptionEndDate = end;
          await profile.save();

          await User.findByIdAndUpdate(profile.user, { role: "b2b" });

          await PaymentHistory.findOneAndUpdate(
            { transactionId: paymentEntity.order_id },
            {
              paymentStatus: "completed",
              transactionId: paymentEntity.id,
              subscriptionStartDate: start,
              subscriptionEndDate: end,
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send("Server error");
  }
};

/**
 * 📋 CRUD Operations
 */
const getAllBusinessProfiles = async (req, res) => {
  try {
    const profiles = await BusinessProfile.find().sort({ createdAt: -1 });
    return res.status(200).json({ data: profiles });
  } catch (error) {
    console.error("❌ Error fetching profiles:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await BusinessProfile.findById(id);
    if (!profile) return res.status(404).json({ message: "Business profile not found." });
    return res.status(200).json({ data: profile });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getMyBusinessProfile = async (req, res) => {
  try {
    const profile = await BusinessProfile.findOne({ user: req.user.id });
    if (!profile) return res.status(404).json({ message: "No business profile found for this user." });
    return res.status(200).json({ data: profile });
  } catch (error) {
    console.error("❌ Error fetching my profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessName, ownerName, phone, email, address, gstNumber } = req.body;

    const updatedProfile = await BusinessProfile.findByIdAndUpdate(
      id,
      { businessName, ownerName, phone, email, address, gstNumber },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) return res.status(404).json({ message: "Business profile not found." });
    return res.status(200).json({ message: "Business profile updated successfully.", data: updatedProfile });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteBusinessProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProfile = await BusinessProfile.findByIdAndDelete(id);
    if (!deletedProfile) return res.status(404).json({ message: "Business profile not found." });
    return res.status(200).json({ message: "Business profile deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createBusinessProfile,
  verifyPaymentAndActivate,
  razorpayWebhookHandler,
  getAllBusinessProfiles,
  getBusinessProfileById,
  getMyBusinessProfile,
  updateBusinessProfileById,
  deleteBusinessProfileById,
};
