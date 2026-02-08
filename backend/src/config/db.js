const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
      socketTimeoutMS: 45000, // Socket timeout 45 seconds
      connectTimeoutMS: 30000, // Connection timeout 30 seconds
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000); // Retry after 5 seconds instead of exiting
  }
};

module.exports = connectDB;
