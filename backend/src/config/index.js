'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  fabric: {
    channelName: process.env.CHANNEL_NAME || 'mychannel',
    chaincodeName: process.env.CHAINCODE_NAME || 'traceability',
    cryptoPath: path.resolve(__dirname, '../../', process.env.CRYPTO_PATH || ''),
    certPath: process.env.CERT_PATH || '',
    keyDirPath: process.env.KEY_DIR_PATH || '',
    tlsCertPath: process.env.TLS_CERT_PATH || '',
    peerEndpoint: process.env.PEER_ENDPOINT || 'localhost:7051',
    peerHostAlias: process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com',
    mspId: process.env.MSP_ID || 'Org1MSP',
  },
};

module.exports = config;
