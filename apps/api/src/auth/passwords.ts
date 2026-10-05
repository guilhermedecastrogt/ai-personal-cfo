import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCHEME = 'scrypt';
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAXIMUM_MEMORY = 64 * 1024 * 1024;
const PARTS = 6;

export const MINIMUM_PASSWORD_LENGTH = 10;
export const MAXIMUM_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error === null) {
        resolve(key);
      } else {
        reject(error);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAXIMUM_MEMORY,
  });
  return [
    SCHEME,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELISM),
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== PARTS || parts[0] !== SCHEME) {
    return false;
  }
  const [, cost, blockSize, parallelism, salt, expected] = parts;
  const expectedKey = Buffer.from(expected ?? '', 'base64');
  const key = await derive(password, Buffer.from(salt ?? '', 'base64'), {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism),
    maxmem: MAXIMUM_MEMORY,
  });
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
}

let decoy: Promise<string> | undefined;

export async function spendTimeLikeAVerification(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(SALT_BYTES).toString('base64'));
  await verifyPassword(password, await decoy);
}
