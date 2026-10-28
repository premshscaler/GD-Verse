const mongoose = require('mongoose');
const config = require('./config');

let promise = null;

async function dbConnect() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!config.mongoUri) {
    throw new Error('MONGO_URI is not set. Add it to the server environment variables.');
  }
  if (!promise) {
    promise = mongoose
      .connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
      .then(() => {
        console.log('MongoDB connected');
        return mongoose;
      })
      .catch((e) => {
        promise = null;
        throw e;
      });
  }
  return promise;
}

module.exports = dbConnect;
