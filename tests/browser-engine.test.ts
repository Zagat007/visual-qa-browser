import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { collectGeometryEvidence } from '../audit-engine/geometry/geometry';
import { collectTypographyEvidence } from '../audit-engine/visual/typography';
import { collectImageEvidence } from '../audit-engine/visual/images';
import { stabilizePage } from '../audit-engine/deterministic-capture/stabilize';

const BROWSER_TEST_TIMEOUT_MS = 30_000;

let browser: Browser | null = null;

afterEach(async () => {
  await browser?.close();
  browser = null;
});

describe('rendered browser evidence collectors', () => {
  it('detects overflow, clipped interaction, typography roles and image crop/duplicate evidence', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="gray"/></svg>');
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.wide{width:1000px;height:8px}.clip{position:relative;width:100px;height:50px;overflow:hidden}.clip button{position:absolute;left:80px;top:10px;width:80px;height:30px}.hero-img{width:160px;height:160px;object-fit:cover;object-position:50% 20%}.price{font-size:32px;font-weight:700}.old-price{font-size:18px}.eyebrow{font-size:12px;letter-spacing:1px}.subtitle{font-size:20px}.microcopy{font-size:11px}
    </style></head><body><main><section><div class="eyebrow">EYEBROW</div><h1>Fixture title</h1><div class="subtitle">Subtitle</div><p>Body copy</p><div class="price">2490</div><del class="old-price">3000</del><div class="microcopy">Microcopy</div><div class="clip"><button>Clipped</button></div><img class="hero-img" src="${svg}" alt="fixture"><img class="hero-img" src="${svg}" alt="duplicate"><div class="wide"></div></section></main></body></html>`, { waitUntil: 'load' });

    const geometry = await collectGeometryEvidence(page);
    const typography = await collectTypographyEvidence(page);
    const images = await collectImageEvidence(page);

    expect(geometry.horizontalOverflowPx).toBeGreaterThanOrEqual(190);
    expect(geometry.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'horizontal-overflow', confidence: 'HIGH' }),
      expect.objectContaining({ rule: 'clipping-candidate', confidence: 'HIGH' }),
    ]));
    for (const role of ['H1', 'EYEBROW', 'SUBTITLE', 'BODY', 'PRICE', 'OLD_PRICE', 'MICROCOPY']) {
      expect(typography.groups.find((group) => group.role === role)?.count ?? 0).toBeGreaterThan(0);
    }
    expect(images.totalImages).toBe(2);
    expect(images.sampledImages).toBe(2);
    expect(images.cropCandidates).toBe(2);
    expect(images.duplicateUrlGroups.some((group) => group.count === 2)).toBe(true);
    expect(images.brokenImages).toBe(0);
  }, BROWSER_TEST_TIMEOUT_MS);

  it('treats a terminally broken image as a confirmed defect without mislabeling render readiness as incomplete', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<!doctype html><html><body><img src="data:image/png;base64,not-a-valid-png" alt="broken"></body></html>', { waitUntil: 'load' });
    const stabilization = await stabilizePage(page);
    expect(stabilization.imagesReady).toBe(true);
    expect(stabilization.brokenImageCount).toBe(1);
  }, BROWSER_TEST_TIMEOUT_MS);

  it('does not call a loading image broken or merge distinct signed URLs into duplicate evidence', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"/>';
    await page.route('https://cdn.example.test/**', async (route) => {
      if (route.request().url().includes('/pending.svg')) await held;
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
    });
    await page.setContent(`<!doctype html><img src="https://cdn.example.test/pending.svg">
      <img src="https://cdn.example.test/image.svg?token=one">
      <img src="https://cdn.example.test/image.svg?token=two">`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => [...document.images].slice(1).every((img) => img.complete));
      const evidence = await collectImageEvidence(page);
      expect(evidence.metrics[0]).toMatchObject({ complete: false, broken: false });
      expect(evidence.brokenImages).toBe(0);
      expect(evidence.metrics[1]?.src).toContain('token=%5BREDACTED%5D');
      expect(evidence.metrics[2]?.src).toBe(evidence.metrics[1]?.src);
      expect(evidence.duplicateUrlGroups).toEqual([]);
    } finally {
      release();
    }
  }, BROWSER_TEST_TIMEOUT_MS);

  it('ignores inactive controls and carousel overflow while retaining a real tiny control', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}body{margin:0}.hidden-panel{display:none}.carousel-track{width:300px;overflow:hidden;white-space:nowrap}.carousel-track button{display:inline-block;width:180px;height:44px;margin-right:8px}.real-zero{width:1px;height:1px;padding:0;border:0}.choice{display:flex;width:160px;height:44px;align-items:center}
    </style><main id="main-content" tabindex="-1">
      <div class="hidden-panel"><button style="width:0;height:0">Hidden</button></div>
      <div aria-hidden="true"><button style="width:0;height:0">Hidden aria</button></div>
      <div class="carousel-track"><button>Slide A</button><button>Slide B</button><button>Slide C</button></div>
      <button class="real-zero" id="real-zero" aria-label="tiny"></button>
      <label class="choice"><input class="real-zero" id="labeled-zero" type="checkbox"> Choice</label>
      <input class="real-zero" id="disabled-label-zero" type="checkbox" aria-label="tiny labeled">
      <label class="choice" for="disabled-label-zero" style="pointer-events:none">Not clickable</label>
    </main>`, { waitUntil: 'load' });
    const geometry = await collectGeometryEvidence(page);
    expect(geometry.findings.filter((finding) => finding.rule === 'zero-size-interactive'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: 'button#real-zero', confidence: 'HIGH' }),
        expect.objectContaining({ selector: 'input#disabled-label-zero', confidence: 'HIGH' }),
      ]));
    expect(geometry.findings.some((finding) => finding.rule === 'zero-size-interactive' && finding.selector === 'input#labeled-zero')).toBe(false);
    expect(geometry.findings.some((finding) => finding.rule === 'viewport-horizontal-escape')).toBe(false);
    expect(geometry.findings.some((finding) => finding.rule === 'clipping-candidate' && finding.selector?.includes('carousel'))).toBe(false);
  }, BROWSER_TEST_TIMEOUT_MS);

  it('does not treat alignment alone as a different typography token', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<style>h2{font:600 32px/36px Arial}.center{text-align:center}.left{text-align:left}</style><h2 class="left">Left</h2><h2 class="center">Center</h2>');
    const h2 = (await collectTypographyEvidence(page)).groups.find((group) => group.role === 'H2');
    expect(h2?.count).toBe(2);
    expect(h2?.variants).toHaveLength(1);
  }, BROWSER_TEST_TIMEOUT_MS);

});
