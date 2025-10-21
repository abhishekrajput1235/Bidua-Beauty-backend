const jwt = require("jsonwebtoken");
const User = require("../models/Users"); // Adjust filename if needed

// ----------------------
// Auth Middleware
// ----------------------
const protect = async (req, res, next) => {
  let token;

  try {
    // ✅ 1. Get token from Authorization header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    // ✅ 2. Check if token exists
    if (!token) {
      return res.status(401).json({ message: "Not authorized — no token provided" });
    }

    // ✅ 3. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired, please login again" });
      } else if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token" });
      } else {
        return res.status(401).json({ message: "Token verification failed" });
      }
    }

    // ✅ 4. Check payload
    if (!decoded || !decoded.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // ✅ 5. Attach user info to req.user
    const user = await User.findById(decoded.id).select("-password -otp -otpExpire");

    if (!user) {
      return res.status(401).json({ message: "User not found or deleted" });
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({ message: "Not authorized — something went wrong" });
  }
};

// ----------------------
// Role-based Authorization
// ----------------------
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Access denied — your role (${req.user?.role || "unknown"}) is not permitted`,
    });
  }
  next();
};

// ----------------------
// Admin-only Access
// ----------------------
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied — Admins only" });
  }
  next();
};

module.exports = { protect, authorizeRoles, adminOnly };
