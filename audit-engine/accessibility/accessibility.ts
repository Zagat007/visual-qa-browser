import axe from 'axe-core';
import type { Page } from 'playwright';
import { redactText } from '../privacy/redaction.js';
import type { AccessibilityEvidence } from '../shared/types.js';

interface AxeNodeSlim {
  target: string[];
  failureSummary: string;
}

interface AxeViolationSlim {
  id: string;
  impact: string | null;
  tags: string[];
  help: string;
  helpUrl: string;
  nodes: AxeNodeSlim[];
}

export async function collectAccessibilityEvidence(page: Page): Promise<AccessibilityEvidence> {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: { version: string; run: (context: Document, options: unknown) => Promise<{ violations: AxeViolationSlim[]; incomplete: AxeViolationSlim[]; passes: unknown[]; inapplicable: unknown[] }> } }).axe;
    const output = await engine.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations', 'incomplete', 'passes', 'inapplicable'],
    });
    return {
      version: engine.version,
      violations: output.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        tags: violation.tags,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.slice(0, 50).map((node) => ({
          target: node.target.slice(0, 5),
          failureSummary: node.failureSummary ?? '',
        })),
      })),
      incomplete: output.incomplete.map((item) => ({ id: item.id, impact: item.impact, help: item.help, nodeCount: item.nodes.length })),
      passCount: output.passes.length,
      inapplicableCount: output.inapplicable.length,
    };
  });

  return {
    auditStatus: result.violations.length > 0 ? 'ISSUE' : result.incomplete.length > 0 ? 'PARTIAL' : 'PASS',
    engine: 'axe-core',
    version: result.version,
    automatedOnly: true,
    violationCount: result.violations.length,
    incompleteCount: result.incomplete.length,
    passCount: result.passCount,
    inapplicableCount: result.inapplicableCount,
    violations: result.violations.map((violation) => ({
      ...violation,
      help: redactText(violation.help),
      nodes: violation.nodes.map((node) => ({
        target: node.target.map((target) => redactText(target)),
        failureSummary: redactText(node.failureSummary),
      })),
    })),
    incomplete: result.incomplete.map((item) => ({ ...item, help: redactText(item.help) })),
  };
}
