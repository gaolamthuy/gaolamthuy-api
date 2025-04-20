const auth = require('basic-auth');

/**
 * Basic authentication middleware for all endpoints
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

module.exports = basicAuth; 