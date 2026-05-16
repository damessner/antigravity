'use strict';

const crypto = require('crypto');

function generateSecurePassword(prefix = 'Tmp') {
  const entropy = crypto.randomBytes(9).toString('base64url');
  return `${prefix}_${entropy}!`;
}

module.exports = { generateSecurePassword };
