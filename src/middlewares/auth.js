/**
 * Authentication middleware to protect API routes
 */
const auth = require('basic-auth');

// API Key authentication
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

/**
 * Basic authentication middleware for media/admin endpoints
 * Uses the same credentials defined in .env
 */
const basicAuth = (req, res, next) => {
  const credentials = auth(req);
  
  // Define allowed username/password from environment variables
  const username = process.env.MEDIA_AUTH_USER || 'admin';
  const password = process.env.MEDIA_AUTH_PASS || 'admin';
  
  if (!credentials || credentials.name !== username || credentials.pass !== password) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Protected Area"');
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  
  next();
};

module.exports = {
  authenticate,  // API key auth
  basicAuth      // Basic auth for media endpoints
}; 