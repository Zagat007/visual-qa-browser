import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIArtDirectorProvider, providerCapabilities, type ArtEvidencePackage } from '../audit-engine/art-direction/provider';
import type { ArtDirectionConfiguration } from '../audit-engine/shared/types';

const tempDirs: string[] = [];
const oldKey = process.env.OPENAI_API_KEY;
const oldModel = process.env.OPENAI_ART_DIRECTOR_MODEL;

afterEach(async () => {
  vi.restoreAllMocks();
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  if (oldModel === undefined) delete process.env.OPENAI_ART_DIRECTOR_MODEL; else process.env.OPENAI_ART_DIRECTOR_MODEL = oldModel;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function evidence(imagePath: string): ArtEvidencePackage {
  return {
    version: 1,
    requestedUrl: 'https://example.com/',
    generatedAt: '2026-10-01T00:00:00.000Z',
    mode: 'ECONOMY',
    layers: ['PREMIUM_QUALITY', 'VISUAL_HIERARCHY'],
    brandProfile: {
      id: 'generic', brand_positioning: 'neutral', visual_style: [], target_audience: 'general', tone: [], premium_level: 'unspecified',
      image_style: [], forbidden_visual_patterns: [], preferred_visual_patterns: [], commercial_priorities: [], brand_colors: [], reference_sites: [],
    },
    captures: [],
    images: [{ path: imagePath, label: 'Hero', viewport: 'desktop-1440', section: 'Hero' }],
    technicalContext: { technicalStatus: 'PASS', incompleteCoverage: [] },
  };
}

const config: ArtDirectionConfiguration = {
  enabled: true, provider: 'OPENAI', mode: 'ECONOMY', layers: ['PREMIUM_QUALITY', 'VISUAL_HIERARCHY'], privateEvidenceAllowed: false, siteProfile: 'GENERIC',
};

describe('AI Art Director provider isolation and request contract', () => {
  it('reports OpenAI as not configured unless both key and model are present', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ART_DIRECTOR_MODEL;
    const caps = providerCapabilities();
    expect(caps.providers.find((item) => item.id === 'MANUAL')?.configured).toBe(true);
    expect(caps.providers.find((item) => item.id === 'OPENAI')?.configured).toBe(false);
    process.env.OPENAI_API_KEY = 'test-key';
    expect(providerCapabilities().providers.find((item) => item.id === 'OPENAI')?.configured).toBe(false);
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    expect(providerCapabilities().providers.find((item) => item.id === 'OPENAI')?.configured).toBe(true);
  });

  it('uses Responses API, strict JSON schema, no storage, and image input', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-art-provider-'));
    tempDirs.push(dir);
    const imagePath = path.join(dir, 'hero.png');
    await fs.writeFile(imagePath, Buffer.from([137, 80, 78, 71]));

    const requestBodies: Record<string, unknown>[] = [];
    const payload = {
      overallScore: 90,
      subscores: { visualHierarchy:90, typography:90, spacingRhythm:90, imageQuality:90, imageSemanticFit:90, imageVariety:90, composition:90, brandConsistency:90, premiumPerception:90, conversionPresentation:90 },
      sectionScores: [], findings: [], limitations: [],
    };
    const mockFetch: typeof fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const provider = new OpenAIArtDirectorProvider(mockFetch);
    const result = await provider.review(evidence(imagePath), config);
    expect(result.overallScore).toBe(90);
    expect(requestBodies).toHaveLength(1);
    const requestBody = requestBodies[0];
    expect(requestBody).toBeDefined();
    expect(requestBody?.model).toBe('test-vision-model');
    expect(requestBody?.store).toBe(false);
    const text = JSON.stringify(requestBody);
    expect(text).toContain('json_schema');
    expect(text).toContain('"strict":true');
    expect(text).toContain('input_image');
    expect(text).toContain('UNTRUSTED WEBSITE EVIDENCE');
    expect(String(requestBody?.instructions)).toContain('PROMPT-INJECTION');
    expect(text).toContain('data:image/png;base64');
    expect(text).not.toContain('\"reasoning\"');
  });

  it('honors the parent audit AbortSignal instead of waiting only for the provider timeout', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-art-provider-abort-'));
    tempDirs.push(dir);
    const imagePath = path.join(dir, 'hero.png');
    await fs.writeFile(imagePath, Buffer.from([137, 80, 78, 71]));
    const mockFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const provider = new OpenAIArtDirectorProvider(mockFetch);
    const controller = new AbortController();
    const pending = provider.review(evidence(imagePath), config, controller.signal);
    controller.abort(new Error('test-cancel'));
    await expect(pending).rejects.toThrow('test-cancel');
  });

  it('rejects a pre-aborted audit before reading files or contacting the provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const controller = new AbortController();
    controller.abort(new Error('cancel-before-start'));
    const mockFetch = vi.fn<typeof fetch>();
    const read = vi.spyOn(fs, 'readFile');
    await expect(new OpenAIArtDirectorProvider(mockFetch).review(evidence('missing.png'), config, controller.signal)).rejects.toThrow('cancel-before-start');
    expect(read).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('checks cancellation between image reads and never starts fetch after cancellation', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const controller = new AbortController();
    const read = vi.spyOn(fs, 'readFile').mockImplementationOnce(async () => {
      controller.abort(new Error('cancel-during-image-read'));
      return Buffer.from([137, 80, 78, 71]);
    });
    const mockFetch = vi.fn<typeof fetch>();
    await expect(new OpenAIArtDirectorProvider(mockFetch).review(evidence('fixture.png'), config, controller.signal)).rejects.toThrow('cancel-during-image-read');
    expect(read).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cancels an in-flight fetch using the same parent-bound signal', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const controller = new AbortController();
    const mockFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      controller.abort(new Error('cancel-during-fetch'));
    });
    const input = evidence('unused.png');
    input.images = [];
    await expect(new OpenAIArtDirectorProvider(mockFetch).review(input, config, controller.signal)).rejects.toThrow('cancel-during-fetch');
  });

  it('does not accept successful provider output returned after cancellation', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ART_DIRECTOR_MODEL = 'test-vision-model';
    const controller = new AbortController();
    const mockFetch: typeof fetch = async () => {
      controller.abort(new Error('cancel-before-response'));
      return new Response('{}', { status: 200 });
    };
    const input = evidence('unused.png');
    input.images = [];
    await expect(new OpenAIArtDirectorProvider(mockFetch).review(input, config, controller.signal)).rejects.toThrow('cancel-before-response');
  });
});
