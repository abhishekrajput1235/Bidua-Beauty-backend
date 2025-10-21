const User = require("../models/Users");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/email");


// Generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

/**
 * Register User
 */
const registerUser = async (req, res) => {
  try {
    const { email, phone, password, role } = req.body;

    // ✅ Required fields check
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please fill all required fields" });
    }

    // ✅ Password length validation
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // ✅ Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // ✅ Create new user
    const user = await User.create({
      email,
      phone,
      password,
      role: role || "user",
    });

    return res.status(201).json({
      message: "User registered successfully",
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Login User
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(400).json({ message: "User not found or invalid email or password" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid password" });

    return res.status(200).json({
      message: "Login successful",
      token: generateToken(user._id, user.role),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get Current User Profile
 */
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("wishlist cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Update User Profile
 */
// const updateUserProfile = async (req, res) => {
//   try {
//     const { name, phone, role } = req.body; // include role

//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Allow admin or self-update only
//     // (Optional security: prevent normal users from setting themselves as admin)
//     if (role && req.user.role !== "admin") {
//       return res.status(403).json({ message: "Only admin can change role" });
//     }

//     // Update fields
//     user.name = name || user.name;
//     user.phone = phone || user.phone;
//     if (role) user.role = role; // update role if provided and authorized

//     const updatedUser = await user.save();

//     // Optional: Reissue JWT token with updated role
//     const token = jwt.sign(
//       { id: updatedUser._id, role: updatedUser.role },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     return res.status(200).json({
//       message: "Profile updated successfully",
//       token,
//       user: {
//         id: updatedUser._id,
//         name: updatedUser.name,
//         email: updatedUser.email,
//         phone: updatedUser.phone,
//         role: updatedUser.role,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating profile:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };


const updateUserProfile = async (req, res) => {
  try {
    const { name, phone, role, address } = req.body; // added address

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only admin can change role
    if (role && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can change role" });
    }

    // Update basic fields
    user.name = name || user.name;
    user.phone = phone || user.phone;
    if (role) user.role = role;

    // Update address
    // Expect address as array of objects matching schema
    if (address && Array.isArray(address)) {
      user.address = address.map((addr) => ({
        fullName: addr.fullName || "",
        phone: addr.phone || "",
        street: addr.street || "",
        city: addr.city || "",
        state: addr.state || "",
        postalCode: addr.postalCode || "",
        country: addr.country || "India",
        isDefault: addr.isDefault || false,
      }));
    }

    const updatedUser = await user.save();

    // Reissue JWT with updated role
    const token = jwt.sign(
      { id: updatedUser._id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Profile updated successfully",
      token,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        address: updatedUser.address,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Update User Role
 */
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!role) return res.status(400).json({ message: "Role is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = role;
    await user.save();

    return res.status(200).json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Delete User
 */
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Forgot Password - generate token
 */
const forgotPassword = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const resetToken = crypto.randomBytes(20).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: "Bidua Beauty - Password Reset Request",
    html: `
      <h2>Bidua Beauty - Password Reset Request</h2>
      <p>Click the button below to reset your password:</p>
      <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#facc15;color:black;border-radius:5px;text-decoration:none;">Reset Password</a>
      <p>This link will expire in 10 minutes.</p>
    `,
    text: `Reset your password using this link: ${resetUrl} (expires in 10 minutes)`,
  });

  res.status(200).json({ message: "Password reset email sent successfully" });
};


/**
 * Reset Password - generate token
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;  // token comes from URL (e.g., /reset-password/:token)
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    // Hash the token to compare with the one in the DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user by token and check if token hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Update the password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


/**
 * Get all users 
 */
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const users = await User.find().select("-password");
    return res.status(200).json({
      message: "Users fetched successfully",
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  forgotPassword,
  resetPassword,
  updateUserRole,
  getAllUsers,
};
