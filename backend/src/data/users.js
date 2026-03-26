'use strict';

const bcrypt = require('bcryptjs');

// In-memory prototype users for academic demonstration.
// Passwords are stored as bcrypt hashes (cost factor 12) with per-user random salts.
// bcrypt.hashSync is used once at startup — never on the hot request path.
const BCRYPT_ROUNDS = 12;

const users = [
  {
    id: '1',
    email: 'farmer@agri.com',
    passwordHash: bcrypt.hashSync('farmer123', BCRYPT_ROUNDS),
    name: 'Farm Operator',
    org: 'Org1MSP',
    role: 'farmer',
  },
  {
    id: '2',
    email: 'distributor@agri.com',
    passwordHash: bcrypt.hashSync('distributor123', BCRYPT_ROUNDS),
    name: 'Distribution Manager',
    org: 'Org2MSP',
    role: 'distributor',
  },
  {
    id: '3',
    email: 'retailer@agri.com',
    passwordHash: bcrypt.hashSync('retailer123', BCRYPT_ROUNDS),
    name: 'Retail Manager',
    org: 'Org1MSP',
    role: 'retailer',
  },
];

module.exports = { users };
