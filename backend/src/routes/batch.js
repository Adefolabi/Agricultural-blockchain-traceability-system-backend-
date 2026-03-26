'use strict';

const express = require('express');
const authenticate = require('../middleware/auth');
const { connectToGateway } = require('../services/fabricGateway');
const { hashSensorData } = require('../services/hashService');
const { iotSchema, transferSchema } = require('../validators');

const router = express.Router();

// Helper to decode chaincode response bytes
function decodeResponse(resultBytes) {
  const resultJson = Buffer.from(resultBytes).toString('utf8');
  try {
    return JSON.parse(resultJson);
  } catch {
    const err = new Error('Invalid response from chaincode');
    err.statusCode = 502;
    throw err;
  }
}

// GET /api/verify/:batchId - Public provenance verification
router.get('/verify/:batchId', async (req, res, next) => {
  // Prevent arbitrary strings reaching the chaincode from a public endpoint.
  if (!/^[\w-]{1,100}$/.test(req.params.batchId)) {
    return res.status(400).json({ error: 'Invalid batchId format' });
  }
  let fabricConnection;
  try {
    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.evaluateTransaction(
      'VerifyProvenance',
      req.params.batchId
    );
    const provenance = decodeResponse(resultBytes);
    return res.json(provenance);
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) {
      fabricConnection.close();
    }
  }
});

// GET /api/batches - Get batches owned by the authenticated user's organisation
router.get('/batches', authenticate, async (req, res, next) => {
  let fabricConnection;
  try {
    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.evaluateTransaction(
      'QueryBatchesByOwner',
      req.user.org
    );
    const batches = decodeResponse(resultBytes);
    return res.json(batches);
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) {
      fabricConnection.close();
    }
  }
});

// POST /api/iot - Record IoT sensor data
router.post('/iot', authenticate, async (req, res, next) => {
  let fabricConnection;
  try {
    const parsed = iotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { batchId, temp, humidity, gps, location, timestamp } = parsed.data;
    const sensorDataHash = hashSensorData({ batchId, temp, humidity, gps, location, timestamp });

    fabricConnection = await connectToGateway();
    // Pass the caller's org so the chaincode can verify ownership before writing.
    const resultBytes = await fabricConnection.contract.submitTransaction(
      'RecordSensorData',
      batchId,
      sensorDataHash,
      temp.toString(),
      humidity.toString(),
      location,
      req.user.org
    );
    const result = decodeResponse(resultBytes);
    return res.json({ sensorDataHash, batch: result });
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) {
      fabricConnection.close();
    }
  }
});

// POST /api/transfer - Transfer batch custody
router.post('/transfer', authenticate, async (req, res, next) => {
  let fabricConnection;
  try {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { batchId, newOwnerOrg, location, stage } = parsed.data;

    fabricConnection = await connectToGateway();
    // Pass the caller's org so the chaincode can verify the caller currently owns the batch.
    const resultBytes = await fabricConnection.contract.submitTransaction(
      'TransferCustody',
      batchId,
      req.user.org,
      newOwnerOrg,
      location,
      stage
    );
    const result = decodeResponse(resultBytes);
    return res.json(result);
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) {
      fabricConnection.close();
    }
  }
});

module.exports = router;
