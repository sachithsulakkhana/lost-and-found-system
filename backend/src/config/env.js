module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://mongo:27017/lost-and-found',
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  NODE_ENV: process.env.NODE_ENV || 'development',
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://ml-service:8000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  OTP_EXPIRY_MINUTES: 10
};
