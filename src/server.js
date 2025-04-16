const app = require('./app');

const port = process.env.PORT || 3002;

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
}); 