'use strict';

const { Contract } = require('fabric-contract-api');

class TraceabilityContract extends Contract {

  constructor() {
    super('TraceabilityContract');
  }

  // Create a new produce batch with an initial Farm stage history entry
  async CreateBatch(ctx, batchId, farmId, variety, quantity) {
    const existing = await ctx.stub.getState(batchId);
    if (existing && existing.length > 0) {
      throw new Error(`Batch ${batchId} already exists`);
    }

    const clientOrgId = ctx.clientIdentity.getMSPID();
    const timestamp = new Date().toISOString();

    const batch = {
      batchId,
      farmId,
      variety,
      quantity: parseInt(quantity, 10),
      currentOwner: clientOrgId,
      status: 'compliant',
      location: farmId,
      stage: 'Farm',
      history: [
        {
          action: 'CREATED',
          actor: clientOrgId,
          location: farmId,
          stage: 'Farm',
          timestamp,
          details: { variety, quantity: parseInt(quantity, 10) },
        },
      ],
    };

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // Transfer custody of a batch to a new owner organisation
  async TransferCustody(ctx, batchId, newOwnerOrg, location, stage) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());
    const clientOrgId = ctx.clientIdentity.getMSPID();
    const timestamp = new Date().toISOString();

    batch.currentOwner = newOwnerOrg;
    batch.location = location;
    batch.stage = stage;

    batch.history.push({
      action: 'CUSTODY_TRANSFER',
      actor: clientOrgId,
      location,
      stage,
      timestamp,
      details: { previousOwner: clientOrgId, newOwner: newOwnerOrg },
    });

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // Record IoT sensor data hash on-chain and enforce compliance rules
  async RecordSensorData(ctx, batchId, sensorDataHash, temp, humidity, location) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());
    const clientOrgId = ctx.clientIdentity.getMSPID();
    const timestamp = new Date().toISOString();

    const tempValue = parseFloat(temp);
    const humidityValue = parseFloat(humidity);

    const tempCompliant = tempValue >= 0 && tempValue <= 10;
    const humidityCompliant = humidityValue >= 0 && humidityValue <= 90;
    const isCompliant = tempCompliant && humidityCompliant;

    // Risk status is irreversible
    if (!isCompliant) {
      batch.status = 'risk';
    }

    batch.location = location;

    batch.history.push({
      action: 'SENSOR_READING',
      actor: clientOrgId,
      location,
      stage: batch.stage,
      timestamp,
      details: {
        sensorDataHash,
        temp: tempValue,
        humidity: humidityValue,
        compliant: isCompliant,
      },
    });

    await ctx.stub.putState(batchId, Buffer.from(JSON.stringify(batch)));
    return JSON.stringify(batch);
  }

  // Return the full provenance record for a batch
  async VerifyProvenance(ctx, batchId) {
    const batchBytes = await ctx.stub.getState(batchId);
    if (!batchBytes || batchBytes.length === 0) {
      throw new Error(`Batch ${batchId} does not exist`);
    }

    const batch = JSON.parse(batchBytes.toString());

    const provenance = {
      batchId: batch.batchId,
      product: batch.variety,
      farm: batch.farmId,
      location: batch.location,
      complianceStatus: batch.status,
      currentOwner: batch.currentOwner,
      stage: batch.stage,
      quantity: batch.quantity,
      timeline: batch.history,
    };

    return JSON.stringify(provenance);
  }

  // Query batches by owner using CouchDB rich query
  async QueryBatchesByOwner(ctx, ownerOrg) {
    const queryString = JSON.stringify({
      selector: {
        currentOwner: ownerOrg,
      },
    });

    const iterator = await ctx.stub.getQueryResult(queryString);
    const results = [];

    let result = await iterator.next();
    while (!result.done) {
      const record = JSON.parse(result.value.value.toString('utf8'));
      results.push(record);
      result = await iterator.next();
    }

    await iterator.close();
    return JSON.stringify(results);
  }
}

module.exports = TraceabilityContract;
