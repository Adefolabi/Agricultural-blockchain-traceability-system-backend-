'use strict';

const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Read the first file from a directory (sorted for deterministic selection)
function firstFileIn(dirPath) {
  const files = fs.readdirSync(dirPath).sort();
  if (files.length === 0) {
    throw new Error(`No files found in ${dirPath}`);
  }
  return path.join(dirPath, files[0]);
}

// Resolve environment variable path references
function resolveEnvPath(envValue) {
  const resolved = envValue.replace(/\$\{CRYPTO_PATH\}/g, config.fabric.cryptoPath);
  return path.resolve(__dirname, '../../', resolved);
}

// Create a gRPC connection to the Fabric peer
function createGrpcConnection() {
  const tlsCertPath = resolveEnvPath(process.env.TLS_CERT_PATH || config.fabric.tlsCertPath);
  const tlsCert = fs.readFileSync(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsCert);

  return new grpc.Client(
    config.fabric.peerEndpoint,
    tlsCredentials,
    { 'grpc.ssl_target_name_override': config.fabric.peerHostAlias }
  );
}

// Load user identity from certificate
function loadIdentity() {
  const certPath = resolveEnvPath(process.env.CERT_PATH || config.fabric.certPath);
  const certificate = fs.readFileSync(certPath, 'utf8');
  return { mspId: config.fabric.mspId, credentials: Buffer.from(certificate) };
}

// Load user private key for signing
function loadSigner() {
  const keyDirPath = resolveEnvPath(process.env.KEY_DIR_PATH || config.fabric.keyDirPath);
  const keyPath = firstFileIn(keyDirPath);
  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

// Connect to the Fabric gateway and return contract handle
async function connectToGateway() {
  const client = createGrpcConnection();
  const gateway = connect({
    client,
    identity: loadIdentity(),
    signer: loadSigner(),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  const network = gateway.getNetwork(config.fabric.channelName);
  const contract = network.getContract(config.fabric.chaincodeName);

  return {
    contract,
    close: () => {
      gateway.close();
      client.close();
    },
  };
}

module.exports = { connectToGateway };
