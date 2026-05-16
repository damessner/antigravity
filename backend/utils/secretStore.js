'use strict';

const crypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';

const deriveKey = () => {
  const rawSecret =
    process.env.WEBUNTIS_SECRET_KEY
    || process.env.SYSTEM_SETTINGS_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || 'antigravity-default-dev-secret';
  return crypto.createHash('sha256').update(String(rawSecret)).digest();
};

const isEncryptedSecret = (value) => typeof value === 'string' && value.startsWith(ENC_PREFIX);

const encryptSecret = (value) => {
  if (!value) return '';
  if (isEncryptedSecret(value)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (value) => {
  if (!value) return { value: '', wasPlaintext: false };
  if (!isEncryptedSecret(value)) return { value, wasPlaintext: true };

  const payload = value.slice(ENC_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Ungültiges Secret-Format');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');

  return { value: decrypted, wasPlaintext: false };
};

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
};
