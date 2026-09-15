import type { Page } from '@playwright/test';

// Check rendered text against its composited CSS background, including inherited
// colours and translucent controls. Map labels painted into WebGL are separate.
export async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    type Colour = [number, number, number, number];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const colours = new Map<string, Colour>();
    function colour(value: string): Colour {
      if (!colours.has(value)) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        colours.set(value, [r, g, b, a / 255]);
      }
      return colours.get(value)!;
    }
    function over(top: Colour, bottom: Colour): Colour {
      return [
        ...top.slice(0, 3).map((c, i) => c * top[3] + bottom[i] * (1 - top[3])),
        1,
      ] as Colour;
    }
    function luminance(rgb: Colour) {
      const linear = rgb.slice(0, 3).map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    const failures = new Set<string>();
    function inspect(element: HTMLElement, text: string, pseudo?: string) {
      if (
        !text.trim() ||
        element.closest(
          '[inert], [aria-hidden="true"], :disabled, [aria-disabled="true"], .sr-only',
        )
      )
        return;
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top >= innerHeight ||
        rect.left >= innerWidth
      )
        return;
      const chain: CSSStyleDeclaration[] = [];
      for (
        let node: HTMLElement | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (
          style.visibility !== 'visible' ||
          style.display === 'none' ||
          Number(style.opacity) === 0
        )
          return;
        chain.unshift(style);
      }
      const style = getComputedStyle(element, pseudo);
      let background: Colour = [255, 255, 255, 1];
      for (const ancestor of chain)
        background = over(colour(ancestor.backgroundColor), background);
      const foreground = colour(style.color).slice() as Colour;
      foreground[3] *= chain.reduce(
        (alpha, ancestor) => alpha * Number(ancestor.opacity),
        1,
      );
      const a = luminance(over(foreground, background)),
        b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large =
        parseFloat(style.fontSize) >=
        (Number(style.fontWeight) >= 700 ? 18.66 : 24);
      if (ratio + 0.02 < (large ? 3 : 4.5))
        failures.add(
          `${element.tagName.toLowerCase()}.${String(element.className).split(' ').slice(0, 2).join('.')} ${JSON.stringify(text.trim().slice(0, 75))}: ${ratio.toFixed(2)} (${style.color} on ${background.slice(0, 3).map(Math.round).join(',')})`,
        );
    }
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (
        parent instanceof HTMLElement &&
        !parent.closest('script, style, option, canvas')
      )
        inspect(parent, walker.currentNode.textContent || '');
    }
    document
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(
        'input:not([type="range"]):not([type="color"]):not([type="radio"]):not([type="checkbox"]), textarea, select',
      )
      .forEach((input) => {
        inspect(
          input,
          input.value || input.getAttribute('placeholder') || '',
          !input.value ? '::placeholder' : undefined,
        );
      });
    return [...failures];
  });
}
