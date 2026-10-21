import fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Launcher } from 'chrome-launcher';
import * as childProcess from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { abortable, cleanupOwnedChrome, createOwnedChrome } from '../audit-engine/performance/lifecycle';

vi.mock('node:child_process', { spy: true });

describe('owned Chrome resources', () => {
  it('closes both log descriptors even with an explicit user profile', async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-handles-'));
    const { launcher, closeLogFiles } = createOwnedChrome({ chromePath: 'fixture', userDataDir: profile });
    try {
      launcher.prepare();
      const logs = launcher as unknown as { outFile: number; errFile: number };
      const fds = [logs.outFile, logs.errFile];
      for (const fd of fds) expect(syncFs.fstatSync(fd).isFile()).toBe(true);
      expect(await cleanupOwnedChrome(launcher, null, profile, closeLogFiles)).toEqual([]);
      for (const fd of fds) expect(() => syncFs.fstatSync(fd)).toThrow();
      await expect(fs.stat(profile)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { closeLogFiles(); await fs.rm(profile, { recursive: true, force: true }); }
  });

  it('continues browser and profile cleanup after process termination fails', async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-kill-failure-'));
    const child = { pid: 123456789, exitCode: null, signalCode: null, kill: vi.fn(() => { throw new Error('fallback-denied'); }) };
    const launcher = { chromeProcess: child, destroyTmp: vi.fn() } as unknown as Launcher;
    const close = vi.fn(async () => undefined);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('termination-denied'), { code: 'EPERM' }); });
    const taskkill = vi.mocked(childProcess.execFile).mockImplementation(((...args: unknown[]) => {
      queueMicrotask(() => (args.at(-1) as (error: Error) => void)(new Error('termination-denied')));
      return {};
    }) as typeof childProcess.execFile);
    try {
      const errors = await cleanupOwnedChrome(launcher, { close } as never, profile);
      expect(errors.some((error) => error.includes('termination'))).toBe(true);
      expect(close).toHaveBeenCalledTimes(1);
      expect(launcher.destroyTmp).toHaveBeenCalledTimes(1);
      await expect(fs.stat(profile)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { kill.mockRestore(); taskkill.mockRestore(); await fs.rm(profile, { recursive: true, force: true }); }
  });

  it('consumes late rejection after an abort without waiting for the operation', async () => {
    const controller = new AbortController();
    let reject!: (error: Error) => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const result = abortable(() => { entered(); return new Promise<never>((_resolve, fail) => { reject = fail; }); }, controller.signal);
    const settled = result.catch((error: Error) => error.message);
    await ready;
    controller.abort(new Error('cancel-now'));
    expect(await settled).toBe('cancel-now');
    reject(new Error('late-failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('bounds a stalled CDP close and still removes the owned profile', async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-close-timeout-'));
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => originalTimeout(Math.min(ms, 20)));
    try {
      const errors = await cleanupOwnedChrome({ destroyTmp() {} } as Launcher, { close: () => new Promise(() => {}) } as never, profile);
      expect(timeout).toHaveBeenCalledWith(5000);
      expect(errors.some((error) => error.includes('CDP cleanup failed'))).toBe(true);
      await expect(fs.stat(profile)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { timeout.mockRestore(); await fs.rm(profile, { recursive: true, force: true }); }
  });
});
