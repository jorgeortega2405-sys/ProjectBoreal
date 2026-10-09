import crypto from 'crypto';

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_COST, p: SCRYPT_PARALLELIZATION, r: SCRYPT_BLOCK_SIZE },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derivedKey.toString('hex')}`
        );
      }
    );
  });
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!storedHash || !password || typeof storedHash !== 'string' || typeof password !== 'string') {
      resolve(false);
      return;
    }

    const parts = storedHash.split('$');
    if (parts.length === 6 && parts[0] === 'scrypt') {
      const N = parseInt(parts[1], 10);
      const r = parseInt(parts[2], 10);
      const p = parseInt(parts[3], 10);
      const salt = parts[4];
      const originalKeyHex = parts[5];

      if (!salt || !originalKeyHex || isNaN(N) || isNaN(r) || isNaN(p)) {
        resolve(false);
        return;
      }

      crypto.scrypt(password, salt, KEY_LENGTH, { N, p, r }, (err, derivedKey) => {
        if (err) {
          resolve(false);
          return;
        }
        try {
          const originalBuffer = Buffer.from(originalKeyHex, 'hex');
          if (originalBuffer.length !== derivedKey.length) {
            resolve(false);
            return;
          }
          resolve(crypto.timingSafeEqual(originalBuffer, derivedKey));
        } catch {
          resolve(false);
        }
      });
      return;
    }

    resolve(false);
  });
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateUuid(): string {
  return crypto.randomUUID();
}
