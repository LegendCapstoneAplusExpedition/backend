const mongoose = require('mongoose');
const config = require('../config');

module.exports = async () => {
  try {
    const connection = await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB 연결 성공!');
    return connection.connection.db;
  } catch (err) {
    console.error('❌ DB 연결 실패:', err);
    throw err;
  }
};
