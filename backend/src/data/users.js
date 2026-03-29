'use strict';

const bcrypt = require('bcryptjs');

// In-memory prototype users for academic demonstration.
// Passwords are stored as bcrypt hashes (cost factor 12) with per-user random salts.
// bcrypt.hashSync is used once at startup — never on the hot request path.
const BCRYPT_ROUNDS = 12;

const users = [
  {
    id:           '1',
    email:        'farmer@agri.com',
    passwordHash: bcrypt.hashSync('farmer123', BCRYPT_ROUNDS),
    name:         'Farm Operator',
    org:          'Org1MSP',
    role:         'farmer',
  },
  {
    id:           '2',
    email:        'processor@agri.com',
    passwordHash: bcrypt.hashSync('processor123', BCRYPT_ROUNDS),
    name:         'Processing Manager',
    org:          'Org2MSP',
    role:         'processor',
  },
  {
    id:           '3',
    email:        'transporter@agri.com',
    passwordHash: bcrypt.hashSync('transporter123', BCRYPT_ROUNDS),
    name:         'Logistics Operator',
    org:          'Org2MSP',
    role:         'transporter',
  },
  {
    id:           '4',
    email:        'retailer@agri.com',
    passwordHash: bcrypt.hashSync('retailer123', BCRYPT_ROUNDS),
    name:         'Retail Manager',
    org:          'Org1MSP',
    role:         'retailer',
  },
];

module.exports = { users };
