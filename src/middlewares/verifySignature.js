const crypto = require("crypto");

const verifyRazorpaySignature = (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    req.isVerified = true;
    next();
  } else {
    req.isVerified = false;
    return res.status(400).json({
      success: false,
      message: "Invalid signature",
    });
  }
};

module.exports = { verifyRazorpaySignature };
