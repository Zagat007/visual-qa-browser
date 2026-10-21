import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import * as syncFs from 'node:fs';
import { Launcher, type Options } from 'chrome-launcher';
import type { Browser } from 'playwright';

// Reject the wait immediately on cancellation even when the underlying library
// ignores AbortSignal. Rejection handlers remain attached to late completions.
export function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason); };
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(
      (value) => { signal.removeEventListener('abort', aborted); if (signal.aborted) reject(signal.reason); else resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', aborted); reject(error); },
    );
  });
}

export const bounded = <T>(operation: () => Promise<T>, timeoutMs: number) => abortable(operation, AbortSignal.timeout(timeoutMs));

export function createOwnedChrome(options: Options): { launcher: Launcher; closeLogFiles: () => void } {
  const handles = new Set<number>();
  // chrome-launcher 1.2.1 destroyTmp returns before closing errFile when a
  // userDataDir is supplied. Track its descriptors through the supported fs
  // override, so Windows can remove the profile without an open log handle.
  const trackedFs = new Proxy(syncFs, {
    get(target, property) {
      if (property === 'openSync') return (...args: Parameters<typeof syncFs.openSync>) => {
        const fd = target.openSync(...args);
        handles.add(fd);
        return fd;
      };
      if (property === 'closeSync') return (fd: number) => { target.closeSync(fd); handles.delete(fd); };
      return Reflect.get(target, property);
    },
  });
  return {
    launcher: new Launcher(options, { fs: trackedFs }),
    closeLogFiles: () => {
      const errors: unknown[] = [];
      for (const fd of handles) {
        try { syncFs.closeSync(fd); handles.delete(fd); } catch (error) { errors.push(error); }
      }
      if (errors.length > 0) throw new AggregateError(errors, 'Chrome log handle cleanup failed');
    },
  };
}

export async function cleanupOwnedChrome(launcher: Launcher, browser: Browser | null, profile: string, closeLogFiles?: () => void): Promise<string[]> {
  const errors: string[] = [];
  const child = launcher.chromeProcess;
  const pid = child?.pid;
  if (pid && child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === 'win32') {
        // chrome-launcher.kill() uses spawnSync(taskkill) on Windows. Running it
        // inside an abort listener can freeze every backend HTTP response.
        await new Promise<void>((resolve, reject) => {
          execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
            windowsHide: true, timeout: 5000,
          }, (error) => error ? reject(error) : resolve());
        });
      } else {
        // Launcher owns a detached process group on non-Windows platforms.
        process.kill(-pid, 'SIGKILL');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH' && child.exitCode === null && child.signalCode === null) {
        errors.push(`Chrome termination failed: ${error instanceof Error ? error.message : String(error)}`);
        try { child.kill('SIGKILL'); }
        catch (fallbackError) { errors.push(`Chrome termination fallback failed: ${String(fallbackError)}`); }
      }
    }
  }
  if (browser) {
    try { await bounded(() => browser.close(), 5000); }
    catch (error) { errors.push(`CDP cleanup failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  // A supplied userDataDir makes destroyTmp close handles only. Remove our
  // profile asynchronously with bounded retries, never via synchronous taskkill.
  try { launcher.destroyTmp(); } catch (error) { errors.push(`Chrome handle cleanup failed: ${String(error)}`); }
  try { closeLogFiles?.(); } catch (error) { errors.push(`Chrome log cleanup failed: ${String(error)}`); }
  try { await bounded(() => fs.rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }), 5000); }
  catch (error) { errors.push(`Chrome profile cleanup failed: ${error instanceof Error ? error.message : String(error)}`); }
  return errors;
}
