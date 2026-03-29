'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  email:    z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// batchId shares the same safe-character rule used in the verify route
const safeBatchId = z
  .string()
  .min(1, 'batchId is required')
  .regex(/^[\w-]{1,100}$/, 'batchId must be 1-100 alphanumeric characters, hyphens, or underscores');

const batchSchema = z.object({
  batchId:  safeBatchId,
  farmId:   z.string().min(1, 'farmId is required'),
  variety:  z.string().min(1, 'variety is required'),
  quantity: z
    .number({ required_error: 'quantity is required' })
    .int('quantity must be an integer')
    .positive('quantity must be a positive integer'),
});

const iotSchema = z.object({
  batchId:   safeBatchId,
  temp:      z.number({ required_error: 'temp is required' }),
  humidity:  z.number({ required_error: 'humidity is required' }),
  gps:       z.string().optional(),
  location:  z.string().min(1, 'location is required'),
  // Caller must supply a stable timestamp so the hash is deterministic
  // and independently verifiable against the on-chain anchor.
  timestamp: z.string().datetime({ message: 'timestamp must be an ISO-8601 date-time string with timezone' }),
});

const transferSchema = z.object({
  batchId:     safeBatchId,
  newOwnerOrg: z.string().min(1, 'newOwnerOrg is required'),
  location:    z.string().min(1, 'location is required'),
  stage:       z.string().min(1, 'stage is required'),
});

module.exports = {
  loginSchema,
  batchSchema,
  iotSchema,
  transferSchema,
};
