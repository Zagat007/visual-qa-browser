import type { Page } from 'playwright';
import type { GeometryEvidence } from '../shared/types.js';

export async function collectGeometryEvidence(page: Page): Promise<GeometryEvidence> {
  return page.evaluate(() => {
    type Rect = { x: number; y: number; width: number; height: number };
    type Candidate = {
      selector: string;
      rect: Rect;
      position: string;
      interactive: boolean;
      element: Element;
    };

    const MAX_ELEMENTS = 4000;
    const MAX_FINDINGS = 120;
    const MAX_OVERLAP_CANDIDATES = 160;
    const MAX_OVERLAP_FINDINGS = 30;
    const MAX_STACKING = 160;
    const MAX_STICKY_FIXED = 120;
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentScrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const documentScrollHeight = Math.max(root.scrollHeight, body?.scrollHeight ?? 0);
    const horizontalOverflowPx = Math.max(0, documentScrollWidth - viewportWidth);
    const findings: GeometryEvidence['findings'] = [];
    const stickyFixed: GeometryEvidence['stickyFixed'] = [];
    const stackingContexts: GeometryEvidence['stackingContexts'] = [];

    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (html.id) return `${tag}#${html.id.slice(0, 80)}`;
      const qa = element.getAttribute('data-qa-section') || element.getAttribute('data-testid');
      if (qa) return `${tag}[qa=${qa.slice(0, 60)}]`;
      const classes = [...element.classList].slice(0, 3).map((item) => item.slice(0, 40));
      return classes.length ? `${tag}.${classes.join('.')}` : tag;
    };
    const rectValue = (rect: DOMRect): Rect => ({
      x: Math.round(rect.x * 10) / 10,
      y: Math.round(rect.y * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });
    const isSuppressedByState = (element: Element): boolean => {
      let current: Element | null = element;
      while (current) {
        const html = current as HTMLElement;
        const currentStyle = getComputedStyle(html);
        if (
          html.hidden
          || current.hasAttribute('inert')
          || current.getAttribute('aria-hidden') === 'true'
          || currentStyle.display === 'none'
          || currentStyle.visibility === 'hidden'
          || currentStyle.visibility === 'collapse'
          || Number(currentStyle.opacity || '1') <= 0.01
        ) return true;
        if (current instanceof HTMLDetailsElement && !current.open) {
          const summary = current.querySelector(':scope > summary');
          if (!summary || !summary.contains(element)) return true;
        }
        if (current === root) break;
        current = current.parentElement;
      }
      return false;
    };
    const isInteractive = (element: Element): boolean => {
      const html = element as HTMLElement;
      if (element.matches('input[type="hidden"],:disabled,[aria-disabled="true"]')) return false;
      if (element.matches('a[href],button,input,select,textarea,[role="button"],[role="link"]')) return true;
      return element.hasAttribute('tabindex') && html.tabIndex >= 0;
    };
    const visible = (style: CSSStyleDeclaration, rect: DOMRect, element: Element): boolean =>
      !isSuppressedByState(element)
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0.01
      && rect.width > 0
      && rect.height > 0;
    const intentionallyVisuallyHidden = (style: CSSStyleDeclaration, rect: DOMRect): boolean => {
      if (rect.width >= 2 || rect.height >= 2) return false;
      const clip = style.clip.replace(/\s+/g, '').toLowerCase();
      return /^rect\(0(px)?,0(px)?,0(px)?,0(px)?\)$/.test(clip)
        || /^inset\(50%(\s+50%){0,3}\)$/.test(style.clipPath.trim().toLowerCase());
    };
    const hasUsableAssociatedLabel = (element: Element): boolean => {
      if (!(element instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(element.type.toLowerCase())) return false;
      return Array.from(element.labels ?? []).some((label) => {
        if (isSuppressedByState(label)) return false;
        const labelRect = label.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        return labelRect.width >= 2
          && labelRect.height >= 2
          && labelStyle.display !== 'none'
          && labelStyle.visibility !== 'hidden'
          && Number(labelStyle.opacity || '1') > 0.01
          && labelStyle.pointerEvents !== 'none';
      });
    };
    const isIntentionalHorizontalViewport = (element: Element): boolean => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const semanticHint = `${html.id} ${typeof html.className === 'string' ? html.className : ''} ${html.getAttribute('role') ?? ''} ${html.getAttribute('aria-roledescription') ?? ''}`.toLowerCase();
      return style.overflowX === 'auto'
        || style.overflowX === 'scroll'
        || style.scrollSnapType.includes('x')
        || /(carousel|slider|scroller|swiper|splide|track|rail|strip)/i.test(semanticHint);
    };
    const hasIntentionalHorizontalOwner = (element: Element): boolean => {
      let parent = element.parentElement;
      while (parent && parent !== body && parent !== root) {
        const html = parent as HTMLElement;
        const style = getComputedStyle(html);
        const clipsOrScrolls = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
        if (clipsOrScrolls && html.scrollWidth > html.clientWidth + 2 && isIntentionalHorizontalViewport(parent)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const pushFinding = (finding: GeometryEvidence['findings'][number]): void => {
      if (findings.length < MAX_FINDINGS) findings.push(finding);
    };

    if (horizontalOverflowPx > 2) {
      pushFinding({
        rule: 'horizontal-overflow',
        severity: 'P2',
        confidence: 'HIGH',
        message: `Document scrollWidth exceeds viewport by ${horizontalOverflowPx}px.`,
      });
    }

    const allAvailable = Array.from(body?.querySelectorAll('*') ?? []);
    const all = allAvailable.slice(0, MAX_ELEMENTS);
    const overlapCandidates: Candidate[] = [];

    for (const element of all) {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      const interactive = isInteractive(element);
      const suppressed = isSuppressedByState(element);
      const activeInteractive = interactive && !suppressed;
      const isVisible = visible(style, rect, element);
      if (!isVisible && !activeInteractive) continue;
      const selector = describe(element);
      const position = style.position;

      if (activeInteractive && (rect.width < 2 || rect.height < 2) && !intentionallyVisuallyHidden(style, rect) && !hasUsableAssociatedLabel(element)) {
        pushFinding({
          rule: 'zero-size-interactive',
          severity: 'P2',
          confidence: 'HIGH',
          selector,
          rect: rectValue(rect),
          message: 'Interactive element is rendered with near-zero geometry.',
        });
      }

      const clipsX = (style.overflowX === 'hidden' || style.overflowX === 'clip') && html.scrollWidth > html.clientWidth + 3;
      const clipsY = (style.overflowY === 'hidden' || style.overflowY === 'clip') && html.scrollHeight > html.clientHeight + 3;
      if (clipsX || clipsY) {
        const interactiveDescendants = Array.from(element.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"],[tabindex]'))
          .filter((child) => isInteractive(child) && !isSuppressedByState(child))
          .slice(0, 24);
        let clippedInteractive: Element | undefined;
        let clippedHorizontally = false;
        let clippedVertically = false;
        for (const child of interactiveDescendants) {
          const childRect = (child as HTMLElement).getBoundingClientRect();
          if (childRect.width < 2 || childRect.height < 2) continue;
          const horizontal = clipsX && (childRect.left < rect.left - 2 || childRect.right > rect.right + 2);
          const vertical = clipsY && (childRect.top < rect.top - 2 || childRect.bottom > rect.bottom + 2);
          if (!horizontal && !vertical) continue;
          if (horizontal && !vertical && isIntentionalHorizontalViewport(element)) continue;
          clippedInteractive = child;
          clippedHorizontally = horizontal;
          clippedVertically = vertical;
          break;
        }
        if (clippedInteractive) {
          pushFinding({
            rule: 'clipping-candidate',
            severity: 'P2',
            confidence: 'HIGH',
            selector,
            rect: rectValue(rect),
            relatedSelector: describe(clippedInteractive),
            relatedRect: rectValue((clippedInteractive as HTMLElement).getBoundingClientRect()),
            message: `Overflow clipping intersects rendered interactive content (${clippedHorizontally ? 'horizontal' : ''}${clippedHorizontally && clippedVertically ? '+' : ''}${clippedVertically ? 'vertical' : ''}).`,
          });
        }
      }

      const fixedLike = position === 'fixed' || position === 'sticky';
      if (fixedLike && rect.width > 0 && rect.height > 0) {
        const areaRatio = (rect.width * rect.height) / Math.max(1, viewportWidth * viewportHeight);
        if (stickyFixed.length < MAX_STICKY_FIXED) {
          stickyFixed.push({
            selector,
            position: position as 'fixed' | 'sticky',
            zIndex: style.zIndex,
            areaRatio: Math.round(areaRatio * 10000) / 10000,
            rect: rectValue(rect),
          });
        }
        if (areaRatio > 0.35) {
          pushFinding({
            rule: 'fixed-obstruction',
            severity: 'P2',
            confidence: 'MEDIUM',
            selector,
            rect: rectValue(rect),
            message: `${position} element covers ${(areaRatio * 100).toFixed(1)}% of the viewport. Visual confirmation required.`,
          });
        }
      }

      if (
        rect.width > 8
        && rect.height > 8
        && (rect.left < -2 || rect.right > viewportWidth + 2)
        && (activeInteractive || fixedLike)
        && (fixedLike || !hasIntentionalHorizontalOwner(element))
      ) {
        pushFinding({
          rule: 'viewport-horizontal-escape',
          severity: 'P2',
          confidence: 'MEDIUM',
          selector,
          rect: rectValue(rect),
          message: 'Interactive/fixed element extends beyond the horizontal viewport boundary. Visual confirmation required.',
        });
      }

      const createsStackingContext = (position !== 'static' && style.zIndex !== 'auto')
        || style.opacity !== '1'
        || style.transform !== 'none'
        || style.filter !== 'none'
        || style.isolation === 'isolate';
      if (createsStackingContext && stackingContexts.length < MAX_STACKING) {
        stackingContexts.push({
          selector,
          position,
          zIndex: style.zIndex,
          transform: style.transform,
          opacity: Number(style.opacity || '1'),
        });
      }

      if (overlapCandidates.length < MAX_OVERLAP_CANDIDATES && isVisible && rect.width > 10 && rect.height > 10 && (activeInteractive || fixedLike || element.matches('h1,h2,h3,[role="dialog"],[role="menu"]'))) {
        overlapCandidates.push({ selector, rect: rectValue(rect), position, interactive: activeInteractive, element });
      }
    }

    let overlapPairsScanned = 0;
    let overlapFindings = 0;
    for (let i = 0; i < overlapCandidates.length && overlapFindings < MAX_OVERLAP_FINDINGS; i += 1) {
      const a = overlapCandidates[i];
      if (!a) continue;
      for (let j = i + 1; j < overlapCandidates.length && overlapFindings < MAX_OVERLAP_FINDINGS; j += 1) {
        const b = overlapCandidates[j];
        if (!b) continue;
        overlapPairsScanned += 1;
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const left = Math.max(a.rect.x, b.rect.x);
        const top = Math.max(a.rect.y, b.rect.y);
        const right = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width);
        const bottom = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height);
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) continue;
        const intersection = width * height;
        const minArea = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
        if (intersection / Math.max(1, minArea) < 0.25) continue;
        if (!(a.interactive || b.interactive || a.position === 'fixed' || b.position === 'fixed' || a.position === 'sticky' || b.position === 'sticky')) continue;
        pushFinding({
          rule: 'overlap-candidate',
          severity: 'P2',
          confidence: 'LOW',
          selector: a.selector,
          relatedSelector: b.selector,
          rect: a.rect,
          relatedRect: b.rect,
          message: 'Bounding boxes overlap materially. Candidate only; intentional compositions must be visually excluded.',
        });
        overlapFindings += 1;
      }
    }

    const sectionItems = Array.from(document.querySelectorAll('main > section, body > section'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, 100);
    const sectionGaps: GeometryEvidence['sectionGaps'] = [];
    for (let index = 1; index < sectionItems.length; index += 1) {
      const previous = sectionItems[index - 1];
      const current = sectionItems[index];
      if (!previous || !current) continue;
      sectionGaps.push({
        from: describe(previous.element),
        to: describe(current.element),
        gapPx: Math.round((current.rect.top - previous.rect.bottom) * 10) / 10,
      });
    }

    return {
      viewportWidth,
      viewportHeight,
      documentScrollWidth,
      documentScrollHeight,
      horizontalOverflowPx,
      elementsScanned: all.length,
      elementsTruncated: allAvailable.length > MAX_ELEMENTS,
      overlapPairsScanned,
      findings: findings.slice(0, MAX_FINDINGS),
      stickyFixed,
      stackingContexts,
      sectionGaps,
    };
  });
}
