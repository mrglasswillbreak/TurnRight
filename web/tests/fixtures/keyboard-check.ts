// Local browser fixture: model iOS/Android's visual-viewport-only keyboard.
// Use a phone viewport, focus Search campus, then type and select/scroll results.
let keyboardOpen = false;
let offsetTop = 0;
const keyboardHeight = 340;
const view = new EventTarget();
Object.defineProperties(view, {
  height: {
    get: () => window.innerHeight - (keyboardOpen ? keyboardHeight : 0),
  },
  width: { get: () => window.innerWidth },
  offsetTop: { get: () => offsetTop },
  offsetLeft: { get: () => 0 },
  pageTop: { get: () => offsetTop },
  pageLeft: { get: () => 0 },
  scale: { get: () => 1 },
});
Object.defineProperty(window, 'visualViewport', {
  configurable: true,
  value: view,
});
const keyboard = document.createElement('aside');
keyboard.setAttribute('aria-label', 'Simulated software keyboard');
keyboard.style.cssText =
  'position:fixed;inset:auto 0 0;height:340px;z-index:1000;background:#bfc5cf;color:#162131;padding:24px;display:none';
keyboard.innerHTML =
  '<p>Simulated phone keyboard</p><button type="button">Pan visible viewport</button><button type="button">Dismiss keyboard</button>';
document.body.append(keyboard);
const update = () => {
  keyboard.style.display = keyboardOpen ? 'block' : 'none';
  keyboard.style.bottom = -offsetTop + 'px';
  view.dispatchEvent(new Event('resize'));
  view.dispatchEvent(new Event('scroll'));
};
keyboard.addEventListener('pointerdown', (event) => event.preventDefault());
keyboard.querySelectorAll('button')[0].addEventListener('click', () => {
  offsetTop = offsetTop ? 0 : 40;
  update();
});
keyboard.querySelectorAll('button')[1].addEventListener('click', () => {
  keyboardOpen = false;
  offsetTop = 0;
  (document.activeElement as HTMLElement)?.blur();
  update();
});
document.addEventListener('focusin', (event) => {
  if (
    !(event.target instanceof HTMLInputElement) ||
    event.target.getAttribute('aria-label') !== 'Search campus'
  )
    return;
  keyboardOpen = true;
  offsetTop = 0;
  update();
});
document.addEventListener('focusout', () => {
  queueMicrotask(() => {
    if (document.activeElement?.getAttribute('aria-label') === 'Search campus')
      return;
    keyboardOpen = false;
    offsetTop = 0;
    update();
  });
});
await import('../../src/main');
export {};
