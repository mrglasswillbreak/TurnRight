import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  // Windows WebKit's software renderer needs longer for cold map initialization.
  timeout: 120000,
  expect: { timeout: 30000 },
  grep: /phone survey|motion assistance|drawing session.*touch|public phone|editor reliability|building appearance phone|building references phone|view settings phone|enhanced zoom restores|published legacy models.*phone|readable interface dark phone|roof batch phone|slate map.*phone|model workspace touch layouts|landscape model has reachable|reference split|model file workers|campus imports/,
  use: {
    ...base.use,
    browserName: 'webkit',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {},
  },
});
