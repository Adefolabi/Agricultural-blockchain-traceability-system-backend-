'use strict';

const express    = require('express');
const authenticate = require('../middleware/auth');
const authorize    = require('../middleware/authorize');
const { connectToGateway } = require('../services/fabricGateway');
const { hashSensorData }   = require('../services/hashService');
const { batchSchema, iotSchema, transferSchema } = require('../validators');

const router = express.Router();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Decode UTF-8 bytes returned by the chaincode into a JS object.
function decodeResponse(resultBytes) {
  const json = Buffer.from(resultBytes).toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    const err = new Error('Invalid response from chaincode');
    err.statusCode = 502;
    throw err;
  }
}

// Derive which actions a role may perform on a batch, given current ownership.
// isOwner is true when the caller's org matches the batch's currentOwner.
function getAvailableActions(role, isOwner) {
  if (!isOwner) return [];
  switch (role) {
    case 'farmer':      return ['transfer'];
    case 'processor':   return ['transfer'];
    case 'transporter': return ['recordSensor', 'transfer'];
    case 'retailer':    return [];
    default:            return [];
  }
}

// Shape a raw chaincode batch record into a dashboard list item.
function formatBatchSummary(batch, role, userOrg) {
  const history  = Array.isArray(batch.history) ? batch.history : [];
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  const isOwner  = batch.currentOwner === userOrg;

  return {
    id:               batch.batchId,
    variety:          batch.variety,
    farmId:           batch.farmId,
    quantity:         batch.quantity,
    status:           batch.status,
    stage:            batch.stage,
    location:         batch.location,
    owner:            batch.currentOwner,
    updatedAt:        lastEntry ? lastEntry.timestamp : null,
    availableActions: getAvailableActions(role, isOwner),
  };
}

// Shape the chaincode VerifyProvenance response into a consumer-facing object.
// The chaincode returns fields named product, farm, complianceStatus, timeline.
function formatProvenance(p) {
  const timeline  = Array.isArray(p.timeline) ? p.timeline : [];
  const lastEntry = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  return {
    batchId:     p.batchId,
    product:     p.product,
    farm:        p.farm,
    location:    p.location,
    compliant:   p.complianceStatus === 'compliant',
    lastUpdated: lastEntry ? lastEntry.timestamp : null,
    journey:     timeline.map((e) => ({
      action:    e.action,
      actor:     e.actor,
      stage:     e.stage,
      location:  e.location,
      timestamp: e.timestamp,
      details:   e.details || {},
    })),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/verify/:batchId
// Public endpoint - no authentication required.
// Returns a consumer-friendly provenance summary for QR-code scans or audits.
router.get('/verify/:batchId', async (req, res, next) => {
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
    const raw = decodeResponse(resultBytes);
    return res.json(formatProvenance(raw));
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) fabricConnection.close();
  }
});

// GET /api/batches
// Returns dashboard-ready batch list for the authenticated stakeholder.
// Results are scoped to the caller's org and annotated with availableActions
// so the frontend can render role-appropriate controls without extra logic.
router.get('/batches', authenticate, async (req, res, next) => {
  let fabricConnection;
  try {
    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.evaluateTransaction(
      'QueryBatchesByOwner',
      req.user.org
    );
    const raw     = decodeResponse(resultBytes);
    const batches = Array.isArray(raw) ? raw : [];
    return res.json(batches.map((b) => formatBatchSummary(b, req.user.role, req.user.org)));
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) fabricConnection.close();
  }
});

// POST /api/batches
// Farmer only. Creates a new produce batch on the ledger.
router.post('/batches', authenticate, authorize('farmer'), async (req, res, next) => {
  let fabricConnection;
  try {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { batchId, farmId, variety, quantity } = parsed.data;

    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.submitTransaction(
      'CreateBatch',
      batchId,
      farmId,
      variety,
      quantity.toString(),
      req.user.org   // callerOrg: sets currentOwner on-chain
    );
    const result = decodeResponse(resultBytes);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) fabricConnection.close();
  }
});

// POST /api/iot
// Transporter only. Hashes the full sensor payload client-side; only the hash
// and derived compliance outcome are anchored on-chain.
router.post('/iot', authenticate, authorize('transporter'), async (req, res, next) => {
  let fabricConnection;
  try {
    const parsed = iotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { batchId, temp, humidity, gps, location, timestamp } = parsed.data;
    const sensorDataHash = hashSensorData({ batchId, temp, humidity, gps, location, timestamp });

    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.submitTransaction(
      'RecordSensorData',
      batchId,
      sensorDataHash,
      temp.toString(),
      humidity.toString(),
      location,
      req.user.org   // callerOrg: chaincode verifies ownership before writing
    );
    const result = decodeResponse(resultBytes);
    return res.json({ sensorDataHash, batch: result });
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) fabricConnection.close();
  }
});

// POST /api/transfer
// Farmer, processor, or transporter only. Retailer is end-of-chain view-only.
// Note: farmer is included because they must initiate the first custody
// handoff from the farm to the processor to start the supply-chain flow.
// The caller's org is taken from the JWT (not the request body) so it
// cannot be spoofed; the chaincode enforces ownership before writing.
router.post('/transfer', authenticate, authorize('farmer', 'processor', 'transporter'), async (req, res, next) => {
  let fabricConnection;
  try {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { batchId, newOwnerOrg, location, stage } = parsed.data;

    fabricConnection = await connectToGateway();
    const resultBytes = await fabricConnection.contract.submitTransaction(
      'TransferCustody',
      batchId,
      req.user.org,  // currentOwnerOrg: verified against batch.currentOwner on-chain
      newOwnerOrg,
      location,
      stage
    );
    const result = decodeResponse(resultBytes);
    return res.json(result);
  } catch (err) {
    next(err);
  } finally {
    if (fabricConnection) fabricConnection.close();
  }
});

module.exports = router;
