


// controllers/businessController.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const BusinessProfile = require("../models/BusinessProfile");
const User = require("../models/Users");
const PaymentHistory = require("../models/PaymentsHistory");
const { razorpayInstance } = require("../config/razorpay");

const SUBSCRIPTION_AMOUNT_INR = 4999; // ₹4999 Annual Subscription

/**
 * NOTE (DB-level safety):
 * Run this migration once to add a partial unique index so Mongo enforces
 * "only one active BusinessProfile per email":
 *
 * db.businessprofiles.createIndex(
 *   { email: 1 },
 *   { unique: true, partialFilterExpression: { subscriptionStatus: "active" } }
 * );
 *
 * This prevents race conditions from creating two active profiles for same email.
 */

/**
 * Create Business Profile (pending) + create Razorpay order + create PaymentHistory (pending)
 * - Guard: prevents creation when there's already an active (or optionally pending) profile
 */
const createBusinessProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let razorpayOrder = null;

  try {
    const { businessName, ownerName, phone, email, address, gstNumber } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    // Basic validation
    if (!businessName || !ownerName || !phone || !normalizedEmail || !address) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "All required fields must be filled." });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Phone number must be exactly 10 digits." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid email format." });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: missing user ID." });
    }

    // Ensure user exists
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: user not found." });
    }

    // --- Guards: check existing profiles ---
    // 1) Active profile for this email
    const existingActiveByEmail = await BusinessProfile.findOne({
      email: normalizedEmail,
      subscriptionStatus: "active",
    }).session(session);

    if (existingActiveByEmail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "A business with this email already has an active subscription.",
        conflictWith: { id: existingActiveByEmail._id, user: existingActiveByEmail.user },
      });
    }



    // 3) Existing active profile for this user (single B2B profile per user)
    const existingActiveByUser = await BusinessProfile.findOne({
      user: userId,
      subscriptionStatus: "active",
    }).session(session);

    if (existingActiveByUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "This user already has an active B2B profile.",
        conflictWith: { id: existingActiveByUser._id },
      });
    }

    // --- Create pending BusinessProfile ---
    const newProfile = new BusinessProfile({
      user: userId,
      businessName,
      ownerName,
      phone,
      email: normalizedEmail,
      address,
      gstNumber: gstNumber || null,
      subscriptionStatus: "pending",
    });

    const savedProfile = await newProfile.save({ session });

    // --- Create Razorpay order (paise) ---
    const amountPaise = Math.round(SUBSCRIPTION_AMOUNT_INR * 100);
    const receipt = `BRPP_${savedProfile._id.toString().slice(-6)}_${Date.now().toString().slice(-6)}`;

    try {
      // create order with notes so webhook can find bp id
      razorpayOrder = await razorpayInstance.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          businessProfileId: savedProfile._id.toString(),
          userId: userId.toString(),
          email: normalizedEmail,
          phone,
        },
      });
    } catch (rzErr) {
      console.error("Razorpay order creation failed:", rzErr && rzErr.message ? rzErr.message : rzErr);
      await session.abortTransaction();
      session.endSession();
      return res.status(502).json({ message: "Payment provider configuration error", error: String(rzErr?.message || rzErr) });
    }

    // --- Create PaymentHistory (pending) ---
    const paymentRecord = new PaymentHistory({
      user: userId,
      businessProfile: savedProfile._id,
      paymentFor: "subscription",
      order: `order_${razorpayOrder.id}`,
      amount: SUBSCRIPTION_AMOUNT_INR,
      currency: "INR",
      paymentMethod: "Razorpay",
      paymentStatus: "pending",
      transactionId: razorpayOrder.id, // razorpay order id
      subscriptionType: "BRPP Annual",
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    });

    await paymentRecord.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Return razorpayOrder + public key to client to initialize checkout
    return res.status(201).json({
      message: "Business profile created successfully. Proceed to payment.",
      businessProfile: savedProfile,
      paymentRecord,
      razorpayOrder,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // safe to send public key id to client
      amount: SUBSCRIPTION_AMOUNT_INR,
    });
  } catch (error) {
    try {
      if (razorpayOrder?.id) {
        // Optional: attempt to cleanup or log orphaned razorpayOrder id for later reconciliation.
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up razorpay order after failure:", cleanupErr);
    }

    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error creating business profile:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * Verify payment (client can call this after checkout completes) and activate subscription
 * Expects: { razorpay_order_id, razorpay_payment_id, razorpay_signature, businessProfileId }
 */
const verifyPaymentAndActivate = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, businessProfileId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !businessProfileId) {
      return res.status(400).json({ message: "Missing required payment verification fields." });
    }

    // Verify signature (server-side)
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature." });
    }

    // Find the business profile
    const profile = await BusinessProfile.findById(businessProfileId);
    if (!profile) return res.status(404).json({ message: "Business profile not found." });

    // Find or create payment record
    let paymentRecord = await PaymentHistory.findOne({ transactionId: razorpay_order_id });
    if (!paymentRecord) {
      paymentRecord = await PaymentHistory.findOne({ order: `order_${razorpay_order_id}` });
    }

    if (paymentRecord) {
      // Update payment record idempotently
      paymentRecord.paymentStatus = "success";
      paymentRecord.order = paymentRecord.order || `order_${razorpay_order_id}`;
      paymentRecord.transactionId = razorpay_order_id;
      paymentRecord.paymentProviderPaymentId = razorpay_payment_id; // if schema allows
      paymentRecord.subscriptionStartDate = new Date();
      paymentRecord.subscriptionEndDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      await paymentRecord.save();
    } else {
      // Create fallback payment record so we don't lose the payment
      paymentRecord = await new PaymentHistory({
        user: profile.user,
        businessProfile: profile._id,
        amount: SUBSCRIPTION_AMOUNT_INR,
        currency: "INR",
        paymentMethod: "Razorpay",
        paymentStatus: "success",
        transactionId: razorpay_order_id,
        paymentProviderPaymentId: razorpay_payment_id,
        subscriptionType: "BRPP Annual",
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        paymentFor: "subscription",
        order: `order_${razorpay_order_id}`,
      }).save();
    }

    // Activate profile idempotently
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);

    if (profile.subscriptionStatus !== "active") {
      profile.subscriptionStatus = "active";
      profile.subscriptionStartDate = start;
      profile.subscriptionEndDate = end;
      await profile.save();
    }

    // Update user role to b2b (idempotent)
    await User.findByIdAndUpdate(profile.user, { role: "b2b" });

    return res.status(200).json({
      message: "Payment verified and subscription activated successfully.",
      profile,
    });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * Razorpay webhook handler (server-to-server authoritative)
 * - Expect express configured to populate req.rawBody for signature verification
 * - Handles payment.captured or payment.authorized events
 */
const razorpayWebhookHandler = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // req.rawBody must be set by express middleware (see snippet below)
    const generated = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("hex");
    if (generated !== signature) {
      console.warn("⚠️ Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;

    if (event?.event === "payment.captured" || event?.event === "payment.authorized") {
      const paymentEntity = event.payload?.payment?.entity || {};
      const notes = paymentEntity.notes || {};
      const bpId = notes.businessProfileId; // set in notes during order create
      const orderId = paymentEntity.order_id; // razorpay order id
      const paymentId = paymentEntity.id; // razorpay payment id

      // If businessProfileId present in notes, activate the profile
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

          // Update user role
          await User.findByIdAndUpdate(profile.user, { role: "b2b" });

          // Update or create payment history record
          let paymentRecord = await PaymentHistory.findOne({ transactionId: orderId });
          if (!paymentRecord) {
            paymentRecord = await PaymentHistory.findOne({ order: `order_${orderId}` });
          }

          if (paymentRecord) {
            paymentRecord.paymentStatus = "success";
            paymentRecord.paymentProviderPaymentId = paymentId;
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
              transactionId: orderId,
              paymentProviderPaymentId: paymentId,
              subscriptionType: "BRPP Annual",
              subscriptionStartDate: start,
              subscriptionEndDate: end,
              paymentFor: "subscription",
              order: `order_${orderId}`,
            }).save();
          }
        }
      }
    }

    // Return 200 quickly to Razorpay
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send("Server error");
  }
};

/**
 * CRUD operations — unchanged but included for completeness
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
