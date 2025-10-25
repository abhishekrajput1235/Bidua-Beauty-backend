const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes')
const businessProfileRoutes = require('./routes/businessProfileRoutes');
const productRoutes = require("./routes/productRoutes")
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const checkOutRoutes = require('./routes/checkoutRoutes')
const walletRoutes = require('./routes/walletRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentHistoryRoutes = require('./routes/paymentHistoryRoutes');
const path = require("path");

dotenv.config(); // only once

const app = express();

// Middleware
app.use(express.json());
// app.use(cors({
//   origin: true,
//   credentials: true,
// }));

app.use(cors());

//Serve static uploads
app.use("/upload", express.static(path.join(__dirname, "../upload")));
console.log("Serving static files from:", path.join(__dirname, "../upload"));

// Connect MongoDB
connectDB()
  .then(() => console.log('📦 MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/v1', userRoutes);
app.use('/api/v1',businessProfileRoutes);
app.use('/api/v1/products',productRoutes);
app.use('/api/v1/cart',cartRoutes);
app.use('/api/v1/order',orderRoutes);
app.use('/api/v1/checkout',checkOutRoutes)
app.use('/api/v1/wallet', walletRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/payment-history", paymentHistoryRoutes);


// Test route
app.get('/', (req, res) => res.send('Server is running ✅'));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));