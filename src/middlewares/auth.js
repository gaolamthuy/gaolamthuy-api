/**
 * Authentication middleware to protect API routes
 */
const authenticate = (req, res, next) => {
  const token = req.headers["x-api-key"];
  
  if (!token || token !== process.env.YOUR_SECRET_TOKEN) {
    return res.status(403).json({ 
      success: false, 
      message: "Forbidden: Invalid API key" 
    });
  }
  
  next();
};

module.exports = authenticate; 