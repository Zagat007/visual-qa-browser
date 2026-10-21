import type { Page } from 'playwright';
import type { StabilizationEvidence } from '../shared/types.js';

interface ImageState {
  count: number;
  broken: number;
  ready: boolean;
}

async function inspectImages(page: Page, timeoutMs: number): Promise<ImageState> {
  try {
    await page.waitForFunction(
      () => Array.from(document.images).every((img) => img.complete),
      undefined,
      { timeout: timeoutMs },
    );
  } catch {
    // Continue to collect actual terminal image state even when the wait times out.
  }

  try {
    return await page.evaluate(() => {
      const images = Array.from(document.images);
      const pending = images.filter((img) => !img.complete).length;
      const broken = images.filter((img) => img.complete && (img.naturalWidth <= 0 || img.naturalHeight <= 0)).length;
      // Readiness means every image reached a terminal state. A terminally broken
      // image is a confirmed defect, not missing evidence; keep it separate.
      return { count: images.length, broken, ready: pending === 0 };
    });
  } catch {
    return { count: 0, broken: 0, ready: false };
  }
}

async function warmLazyContent(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(async () => {
      const step = Math.max(300, Math.floor(window.innerHeight * 0.75));
      const maxSteps = 120;
      let y = 0;
      let stableBottomSamples = 0;
      for (let steps = 0; steps < maxSteps; steps += 1) {
        const beforeHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const maxY = Math.max(0, beforeHeight - window.innerHeight);
        const targetY = Math.min(y, maxY);
        window.scrollTo(0, targetY);
        await new Promise((resolve) => window.setTimeout(resolve, 40));
        const afterHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const afterMaxY = Math.max(0, afterHeight - window.innerHeight);
        const reachedBottom = targetY >= afterMaxY - 2;
        if (reachedBottom && afterHeight === beforeHeight) {
          stableBottomSamples += 1;
          if (stableBottomSamples >= 2) {
            window.scrollTo(0, 0);
            return true;
          }
        } else {
          stableBottomSamples = 0;
        }
        y = reachedBottom ? afterMaxY : Math.min(afterMaxY, targetY + step);
      }
      window.scrollTo(0, 0);
      // Dynamic/infinite or extremely tall pages are deliberately bounded.
      // Exhausting the bound means coverage is incomplete, never a full PASS.
      return false;
    });
  } catch {
    return false;
  }
}

export async function waitForLayoutStability(
  page: Page,
  options: { maxSamples?: number; intervalMs?: number; requiredStableSamples?: number } = {},
): Promise<boolean> {
  try {
    const maxSamples = options.maxSamples ?? 12;
    const intervalMs = options.intervalMs ?? 200;
    const requiredStableSamples = options.requiredStableSamples ?? 3;
    let stableSamples = 0;
    let previous = '';
    for (let i = 0; i < maxSamples; i += 1) {
      const current = await page.evaluate(() => {
        const body = document.body.getBoundingClientRect();
        const root = document.documentElement.getBoundingClientRect();
        return [
          Math.round(body.width),
          Math.round(body.height),
          Math.round(root.width),
          Math.round(root.height),
          document.fonts.status,
        ].join(':');
      });
      stableSamples = current === previous ? stableSamples + 1 : 0;
      previous = current;
      if (stableSamples >= requiredStableSamples) return true;
      await page.waitForTimeout(intervalMs);
    }
    return false;
  } catch {
    return false;
  }
}

export async function stabilizePage(page: Page): Promise<StabilizationEvidence> {
  let fontsReady = false;
  try {
    fontsReady = await page.evaluate(async () => {
      const timeout = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 5_000));
      const ready = document.fonts.ready.then(() => true, () => false);
      return Promise.race([ready, timeout]);
    });
  } catch {
    fontsReady = false;
  }

  const lazyLoadWarmup = await warmLazyContent(page);
  const imageState = await inspectImages(page, 10_000);

  let networkIdleObserved = false;
  try {
    await page.waitForLoadState('networkidle', { timeout: 5_000 });
    networkIdleObserved = true;
  } catch {
    networkIdleObserved = false;
  }

  let animationsControlled = false;
  try {
    await page.addStyleTag({
      content: `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}`,
    });
    animationsControlled = true;
  } catch {
    animationsControlled = false;
  }

  const layoutStable = await waitForLayoutStability(page);
  return {
    fontsReady,
    imagesReady: imageState.ready,
    imageCount: imageState.count,
    brokenImageCount: imageState.broken,
    lazyLoadWarmup,
    networkIdleObserved,
    layoutStable,
    animationsControlled,
  };
}
