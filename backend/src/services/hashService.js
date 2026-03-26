'use strict';

const crypto = require('crypto');

// Compute SHA-256 hash of an IoT sensor payload object
function hashSensorData(payload) {
  if (!payload.timestamp) {
    throw new Error('hashSensorData requires a timestamp to produce a deterministic hash');
  }
  const serialised = JSON.stringify({
    batchId: payload.batchId,
    temp: payload.temp,
    humidity: payload.humidity,
    gps: payload.gps || '',
    location: payload.location,
    timestamp: payload.timestamp,
  });

  return crypto.createHash('sha256').update(serialised).digest('hex');
}

module.exports = { hashSensorData };
