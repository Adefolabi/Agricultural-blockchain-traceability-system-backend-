'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { users } = require('../data/users');
const { loginSchema } = require('../validators');

const router = express.Router();

// POST /api/login - Authenticate user and return JWT
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { email, password } = parsed.data;

    const user = users.find((u) => u.email === email);

    // Always run bcrypt.compare regardless of whether the user exists.
    // This prevents timing-based email enumeration: both "no such user" and
    // "wrong password" paths take the same ~bcrypt time.
    const DUMMY_HASH = '$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const hashToCheck = user ? user.passwordHash : DUMMY_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, org: user.org, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, org: user.org, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
