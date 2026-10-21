import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';

export interface ScreenshotEvidence {
  screenshotPath: string;
  screenshotBytes: number;
  captureAttempts: number;
  capturedAt: string;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isValidPng(buffer: Buffer): boolean {
  return buffer.length > PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export async function captureScreenshotWithRetry(page: Page, screenshotPath: string, maxAttempts = 2): Promise<ScreenshotEvidence> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error('maxAttempts must be between 1 and 5.');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const buffer = await page.screenshot({ fullPage: true, animations: 'disabled', type: 'png' });
      if (!isValidPng(buffer)) throw new Error('Screenshot buffer is not a valid PNG payload.');
      const tempPath = `${screenshotPath}.tmp-${process.pid}-${attempt}`;
      await fs.writeFile(tempPath, buffer);
      await fs.rename(tempPath, screenshotPath);
      const stat = await fs.stat(screenshotPath);
      if (stat.size !== buffer.length || stat.size === 0) throw new Error('Screenshot write validation failed.');
      return {
        screenshotPath,
        screenshotBytes: stat.size,
        captureAttempts: attempt,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await page.waitForTimeout(250 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Screenshot capture failed.');
}
