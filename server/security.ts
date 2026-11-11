import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('base64url');
export const digest = (v: string) => createHash('sha256').update(v).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  try {
    const [salt, key] = hash.split(':');
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key)) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(actual, Buffer.from(key, 'hex'));
  } catch {
    return false;
  }
}
