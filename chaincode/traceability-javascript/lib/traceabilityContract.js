'use strict';

const { Contract } = require('fabric-contract-api');

class TraceabilityContract extends Contract {

  constructor() {
    super('TraceabilityContract');
  }

  // CreateBatch - initialises a new produce batch on the ledger.
  // callerOrg is passed explicitly by the backend because all Fabric calls
  // share a single service-account identity; the application layer supplies
  // the correct organisational context from the authenticated JWT.
  async CreateBatch(ctx, batchId, farmId, variety, quantity, callerOrg) {
    const existing = await ctx.stub.getState(batchId);
    if (existing && existing.length > 0) {
      throw new Error(`Batch ${batchId} already exists`);
    }

    const timestamp = new Date().toISOString();

    const batch = {
      batchId,
      farmId,
      variety,
      quantity:     parseInt(quantity, 10),
      currentOwner: callerOrg,
      status:       'compliant',
      location:     farmId,
      stage:        'Farm',
      history: [
        {
          action:    'CREATED',
          actor:     callerOrg,
          location:  farmId,
          stage:     'Farm',
          timestamp,
          details:   { variety, quantity: parseInt(quantity, 10) },
        },
      ],
    };

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // TransferCustody - transfers ownership of a batch to a new organisation.
  // currentOwnerOrg is the caller's org (supplied by backend from the JWT).
  // The chaincode verifies the caller actually owns the batch before writing,
  // preventing a different org from hijacking a batch they do not hold.
  async TransferCustody(ctx, batchId, currentOwnerOrg, newOwnerOrg, location, stage) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());

    if (batch.currentOwner !== currentOwnerOrg) {
      throw new Error(
        `Unauthorised: ${currentOwnerOrg} does not own batch ${batchId}`
      );
    }

    const timestamp = new Date().toISOString();

    batch.history.push({
      action:    'CUSTODY_TRANSFER',
      actor:     currentOwnerOrg,
      location,
      stage,
      timestamp,
      details:   { previousOwner: currentOwnerOrg, newOwner: newOwnerOrg },
    });

    batch.currentOwner = newOwnerOrg;
    batch.location     = location;
    batch.stage        = stage;

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // RecordSensorData - anchors an IoT sensor hash on the ledger and evaluates
  // compliance thresholds: temperature 0-10 C, humidity 0-90 %.
  // Risk status is irreversible once set.
  // callerOrg is passed by the backend; the chaincode verifies ownership.
  async RecordSensorData(ctx, batchId, sensorDataHash, temp, humidity, location, callerOrg) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());

    if (batch.currentOwner !== callerOrg) {
      throw new Error(
        `Unauthorised: ${callerOrg} does not own batch ${batchId}`
      );
    }

    const tempValue     = parseFloat(temp);
    const humidityValue = parseFloat(humidity);

    const isCompliant =
      tempValue >= 0 && tempValue <= 10 &&
      humidityValue >= 0 && humidityValue <= 90;

    // Once a batch is flagged as risk it cannot be restored to compliant
    if (!isCompliant && batch.status !== 'risk') {
      batch.status = 'risk';
    }

    const timestamp = new Date().toISOString();

    batch.location = location;
    batch.history.push({
      action:    'SENSOR_READING',
      actor:     callerOrg,
      location,
      stage:     batch.stage,
      timestamp,
      details: {
        sensorDataHash,
        temp:      tempValue,
        humidity:  humidityValue,
        compliant: isCompliant,
      },
    });

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // VerifyProvenance - returns a structured provenance view of the batch.
  // Public read - no ownership check required.
  async VerifyProvenance(ctx, batchId) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());

    return JSON.stringify({
      batchId:          batch.batchId,
      product:          batch.variety,
      farm:             batch.farmId,
      location:         batch.location,
      complianceStatus: batch.status,
      currentOwner:     batch.currentOwner,
      stage:            batch.stage,
      quantity:         batch.quantity,
      timeline:         batch.history,
    });
  }

  // QueryBatchesByOwner - CouchDB rich query returning all batches
  // where currentOwner matches the supplied organisation MSP ID.
  async QueryBatchesByOwner(ctx, ownerOrg) {
    const queryString = JSON.stringify({
      selector: { currentOwner: ownerOrg },
    });

    const iterator = await ctx.stub.getQueryResult(queryString);
    const results  = [];

    let result = await iterator.next();
    while (!result.done) {
      results.push(JSON.parse(result.value.value.toString('utf8')));
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(results);
  }
}

module.exports = TraceabilityContract;
