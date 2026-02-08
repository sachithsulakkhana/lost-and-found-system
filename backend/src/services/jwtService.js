const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.generateToken = (userId) => {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};
