import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

interface EncryptedPayload {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

async function readKey(keyPath: string): Promise<Buffer> {
  const raw = (await fs.readFile(keyPath, 'utf8')).trim();
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('Invalid local checkpoint key length.');
  return key;
}

async function loadOrCreateKey(rootDir: string): Promise<Buffer> {
  const keyPath = path.join(rootDir, 'checkpoints', '.vqb-local-key');
  await fs.mkdir(path.dirname(keyPath), { recursive: true });

  try {
    return await readKey(keyPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') throw error;
  }

  const key = crypto.randomBytes(32);
  try {
    await fs.writeFile(keyPath, `${key.toString('hex')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    return key;
  } catch (error) {
    // Two audits may attempt the first key creation simultaneously. The process
    // that loses the atomic `wx` race must use the key that actually won.
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return readKey(keyPath);
    }
    throw error;
  }
}

/** Bind an exported source snapshot to this installation and canonical project path. */
export async function signWorkspaceSnapshot(rootDir: string, canonicalProjectRoot: string, fingerprint: string): Promise<string> {
  const key = await loadOrCreateKey(rootDir);
  const root = process.platform === 'win32' ? canonicalProjectRoot.toLowerCase() : canonicalProjectRoot;
  return crypto.createHmac('sha256', key).update('vqb-fix-source-v2\0').update(root).update('\0').update(fingerprint).digest('hex');
}

export async function encryptCheckpointSecret(rootDir: string, plaintext: string): Promise<EncryptedPayload> {
  const key = await loadOrCreateKey(rootDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function decryptCheckpointSecret(rootDir: string, payload: EncryptedPayload): Promise<string> {
  if (payload.version !== 1) throw new Error('Unsupported checkpoint secret version.');
  const key = await loadOrCreateKey(rootDir);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
