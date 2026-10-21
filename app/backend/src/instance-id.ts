import crypto from 'node:crypto';
import path from 'node:path';

export function normalizedInstanceRoot(rootDir: string): string {
  return path.resolve(rootDir).replace(/[\\/]+$/, '').toLowerCase();
}

export function computeInstanceId(rootDir: string): string {
  return crypto.createHash('sha256').update(normalizedInstanceRoot(rootDir), 'utf8').digest('hex').slice(0, 24);
}
