import type { InteractionCandidate } from '../shared/types.js';

const DANGEROUS_EN = /\b(pay|payment|purchase|buy|checkout|delete|remove|logout|log\s*out|sign\s*out|unsubscribe|publish|send|confirm|submit|upload|order)\b/i;
const DANGEROUS_RU = /(оплат|купить|заказ|удал|выйти|отпис|опубликов|отправ|подтверд|загруз)/i;

export interface InteractionPolicyInput {
  tag: string;
  role: string;
  type: string;
  text: string;
  href: string;
  disabled: boolean;
  ariaExpanded: string;
  ariaControls: string;
}

export function isDangerousInteractionSignal(value: string): boolean {
  return DANGEROUS_EN.test(value) || DANGEROUS_RU.test(value);
}

export function classifyInteractionCandidate(candidate: InteractionPolicyInput): Pick<InteractionCandidate, 'classification' | 'reason'> {
  const signal = `${candidate.text} ${candidate.href} ${candidate.role} ${candidate.type}`;
  if (candidate.disabled) return { classification: 'SKIPPED_SAFELY', reason: 'Control is disabled.' };
  if (isDangerousInteractionSignal(signal)) return { classification: 'SKIPPED_SAFELY', reason: 'Potentially destructive or externally consequential action.' };
  if (candidate.type === 'submit' || candidate.type === 'file') return { classification: 'SKIPPED_SAFELY', reason: 'Form submission/upload is forbidden in Safe Mode.' };
  if (candidate.href) return { classification: 'FOCUS_ONLY', reason: 'Link activation is not automatic; GET/navigation is not assumed safe.' };
  if (candidate.tag === 'summary') return { classification: 'SAFE_STATE', reason: 'Native disclosure toggle changes local UI state.' };
  if (candidate.role === 'tab') return { classification: 'SAFE_STATE', reason: 'ARIA tab changes local UI state.' };
  if (candidate.ariaExpanded || candidate.ariaControls) return { classification: 'SAFE_STATE', reason: 'ARIA state/control relationship indicates local UI disclosure.' };
  if (candidate.type === 'checkbox' || candidate.type === 'radio') return { classification: 'FOCUS_ONLY', reason: 'Form value changes are not executed automatically; focus state is safe.' };
  return { classification: 'FOCUS_ONLY', reason: 'No proof that activation is side-effect free; hover/focus only.' };
}
