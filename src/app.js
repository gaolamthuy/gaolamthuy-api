require("dotenv").config();
const express = require("express");
const cors = require("cors");
const kiotvietRoutes = require('./routes/kiotvietRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/kiotviet', kiotvietRoutes);

// Simple health check
app.get("/", (req, res) => {
  res.send("✅ KiotViet Clone Service is running!");
});

module.exports = app; 