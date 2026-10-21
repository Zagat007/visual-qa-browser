import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptCheckpointSecret, encryptCheckpointSecret } from '../audit-engine/privacy/secret-store';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe('checkpoint secret store', () => {
  it('does not serialize the target URL in plaintext and decrypts it with the local key', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-secret-'));
    roots.push(root);
    const secret = 'https://example.com/order/private-magic-token';
    const payload = await encryptCheckpointSecret(root, secret);
    expect(JSON.stringify(payload)).not.toContain('private-magic-token');
    await expect(decryptCheckpointSecret(root, payload)).resolves.toBe(secret);
  });

  it('uses one atomic local key when first-use encryption happens concurrently', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-secret-race-'));
    roots.push(root);
    const secrets = Array.from({ length: 12 }, (_, index) => `https://example.com/order/token-${index}`);
    const payloads = await Promise.all(secrets.map((secret) => encryptCheckpointSecret(root, secret)));
    const restored = await Promise.all(payloads.map((payload) => decryptCheckpointSecret(root, payload)));
    expect(restored).toEqual(secrets);
  });
});
