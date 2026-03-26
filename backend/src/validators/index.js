'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const iotSchema = z.object({
  batchId: z.string().min(1, 'batchId is required'),
  temp: z.number({ required_error: 'temp is required' }),
  humidity: z.number({ required_error: 'humidity is required' }),
  gps: z.string().optional(),
  location: z.string().min(1, 'location is required'),
  // Caller must supply a stable timestamp so the hash is deterministic and verifiable on-chain.
  timestamp: z.string().datetime({ message: 'timestamp must be an ISO-8601 date-time string' }),
});

const transferSchema = z.object({
  batchId: z.string().min(1, 'batchId is required'),
  newOwnerOrg: z.string().min(1, 'newOwnerOrg is required'),
  location: z.string().min(1, 'location is required'),
  stage: z.string().min(1, 'stage is required'),
});

module.exports = {
  loginSchema,
  iotSchema,
  transferSchema,
};
